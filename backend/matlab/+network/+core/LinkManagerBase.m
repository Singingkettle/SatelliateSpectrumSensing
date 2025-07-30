classdef LinkManagerBase < handle
    % LINKMANAGERBASE 星地建链管理器基类
    % 定义星地建链仿真的通用接口和基础功能。
    % 所有星座特定的建链规则都通过继承此基类来实现。
    %
    % 参考文献:
    % [1] "Satellite Communications" by Timothy Pratt, Charles W. Bostian, Jeremy E. Allnutt.
    %     - 提供了链路建立和切换的基础理论。
    % [2] "LEO Satellite Communication Networks" by Riccardo de Gaudenzi, et al.
    %     - 讨论了不同LEO星座的网络拓扑和路由挑战。

    properties (Access = protected)
        active_links      % 当前活跃的链路列表
        link_history      % 历史链路记录
    end

    properties (Access = public)
        constellation_name    % 星座名称
        min_elevation_deg     % 最小仰角 (度)
        max_range_km          % 最大通信距离 (km)
    end

    methods
        function obj = LinkManagerBase(constellation_name)
            % 构造函数
            % 输入:
            %   constellation_name (char): 星座名称
            obj.constellation_name = constellation_name;
            obj.active_links = {};
            obj.link_history = {};
            
            % 设置通用默认值，子类可以覆盖这些值
            obj.min_elevation_deg = 10;
            obj.max_range_km = 2500;
        end

        function active_links = get_links_for_snapshot(obj, snapshot)
            % 根据场景快照计算并返回当前时刻的活跃链路
            % 这是供外部调用的、无状态的主要接口方法
            % 输入:
            %   snapshot (struct): 包含当前时刻所有对象状态的结构体
            %     - satellites (cell): {struct('name', 'id', 'latitude', lat, 'longitude', lon, 'altitude', alt)}
            %     - ground_stations (cell): {struct('name', 'id', 'latitude', lat, 'longitude', lon)}
            % 输出:
            %   active_links (cell): 计算出的活跃链路列表

            % 过滤出属于本星座的卫星
            constellation_sats = obj.filter_constellation_satellites(snapshot.satellites);

            if isempty(constellation_sats)
                active_links = {};
                return;
            end

            active_links = {};
            % 为每个地面终端寻找最佳连接
            for i = 1:length(snapshot.ground_stations)
                gs_data = snapshot.ground_stations{i};

                % 调用由子类实现的 specific select_best_satellite 方法
                best_satellite_data = obj.select_best_satellite(gs_data, constellation_sats);

                if ~isempty(best_satellite_data)
                    link = obj.create_link(best_satellite_data, gs_data);
                    if ~isempty(link)
                        active_links{end + 1} = link;
                    end
                end
            end
        end

        function is_visible = is_visible(obj, satellite, ground_station)
            % 检查卫星对于地面站是否可见（满足基本几何条件）
            % 输出:
            %   is_visible (logical): 是否可见
            is_visible = false;
            try
                [~, elevation, range_m] = aer(satellite, ground_station, obj.scenario.SimulationTime);
                if elevation >= obj.min_elevation_deg && (range_m/1000) <= obj.max_range_km
                    is_visible = true;
                end
            catch ME
                warning('无法计算几何关系 %s -> %s: %s', satellite.Name, ground_station.Name, ME.message);
            end
        end
        
        function active_links = get_active_links(obj)
            % 获取当前活跃的链路列表
            active_links = obj.active_links;
        end

    function [az, el, slantRange] = calculate_geometry(obj, sat_data, gs_data)
            % 计算卫星和地面站之间的几何关系（无状态）
            % 使用lla2aer函数进行计算，并强制进行类型转换以确保兼容性。
            % 输入:
            %   sat_data (struct): 卫星数据 {latitude, longitude, altitude}
            %   gs_data (struct): 地面站数据 {latitude, longitude}
            % 输出:
            %   az (double): 方位角 (度)
            %   el (double): 仰角 (度)
            %   slantRange (double): 斜距 (米)
            gs_alt = 0; % 假设地面站海拔为0
            if isfield(gs_data, 'altitude') && ~isempty(gs_data.altitude)
                gs_alt = gs_data.altitude;
            end

            % 强制将所有输入转换为double类型，防止Python->MATLAB类型问题
            sat_lat = double(sat_data.latitude);
            sat_lon = double(sat_data.longitude);
            sat_alt_m = double(sat_data.altitude) * 1000; % 高度转换为米
            gs_lat = double(gs_data.latitude);
            gs_lon = double(gs_data.longitude);
            gs_alt_m = double(gs_alt);

            [az, el, slantRange] = geodetic2aer(sat_lat, sat_lon, sat_alt_m, ...
                                                gs_lat, gs_lon, gs_alt_m, ...
                                                wgs84Ellipsoid('meter'));
        end
    end

    methods (Abstract, Access = protected)
        % 抽象方法 - 必须由子类实现
        best_satellite = select_best_satellite(obj, ground_station, satellites)
    end
    
    methods (Access = private)
        function constellation_sats = filter_constellation_satellites(obj, all_satellites_data)
            % 过滤出属于本星座的卫星
            % 输入: all_satellites_data (cell) - 包含卫星数据结构体的cell数组
            
            % 从cell数组中提取所有卫星的名称
            names = cell(1, length(all_satellites_data));
            for i = 1:length(all_satellites_data)
                if isfield(all_satellites_data{i}, 'name')
                    names{i} = all_satellites_data{i}.name;
                else
                    names{i} = ''; % 如果没有name字段，则为空
                end
            end

            is_member = contains(names, obj.constellation_name, 'IgnoreCase', true);
            constellation_sats = all_satellites_data(is_member);
        end

        function link = create_link(obj, satellite_data, ground_station_data)
            % 创建一个标准的链路信息结构体（无状态版本）
            link = [];
            try
                % 使用无状态的几何计算函数
                [az, el, r_m] = obj.calculate_geometry(satellite_data, ground_station_data);
                
                link = struct(... 
                    'id', sprintf('%s_to_%s', satellite_data.name, ground_station_data.name), ...
                    'satellite', satellite_data, ...
                    'ground_station', ground_station_data, ...
                    'azimuth_deg', az, ...
                    'elevation_deg', el, ...
                    'range_km', r_m / 1000 ...
                );
            catch ME
                 warning('创建链路失败 %s -> %s: %s', satellite_data.name, ground_station_data.name, ME.message);
            end
        end

        function update_active_link_list(obj, new_links)
            % 更新活跃链路列表，并将旧链路存档
            for i = 1:length(obj.active_links)
                old_link = obj.active_links{i};
                old_link.is_active = false;
                old_link.termination_time = obj.scenario.SimulationTime;
                obj.link_history{end+1} = old_link;
            end
            obj.active_links = new_links;
        end
    end
end
