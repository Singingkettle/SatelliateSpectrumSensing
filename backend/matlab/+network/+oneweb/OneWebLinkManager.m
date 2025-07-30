classdef OneWebLinkManager < network.core.LinkManagerBase
    % ONEWEBLINKMANAGER OneWeb星座的建链管理器
    % 实现OneWeb特定的、基于地理小区的建链规则。
    %
    % 参考文献:
    % [1] "OneWeb Satellite Constellation Architecture" - IEEE MILCOM 2018.
    %     - 描述了其基于地理小区的固定波束覆盖策略。
    % [2] OneWeb System Overview - ITU Filing RR Section 9.11A.
    %     - 提供了最小仰角等系统参数。

    methods
        function obj = OneWebLinkManager()
            % 构造函数
            obj@network.core.LinkManagerBase('OneWeb');
            obj.initialize_oneweb_params();
        end

        function initialize_oneweb_params(obj)
            % 初始化OneWeb特定的网络参数
            % 参考文献 [2]
            obj.min_elevation_deg = 30.0;
            obj.max_range_km = 1500.0;
        end
    end

    methods (Access = protected)
        function best_satellite = select_best_satellite(obj, ground_station_data, satellites_data)
            % 为地面终端选择最佳的OneWeb卫星
            % 策略：选择子卫星点最近的卫星，模拟其地理小区策略。
            % 参考文献 [1]

            best_satellite = [];
            min_distance = inf;

            for i = 1:length(satellites_data)
                sat_data = satellites_data{i};
                
                % 检查卫星是否可见
                [~, el, ~] = obj.calculate_geometry(sat_data, ground_station_data);
                if el >= obj.min_elevation_deg
                    % 计算地面站到卫星子卫星点的球面距离
                    dist = distance(ground_station_data.latitude, ground_station_data.longitude, ...
                                    sat_data.latitude, sat_data.longitude, ...
                                    wgs84Ellipsoid('km'));

                    if dist < min_distance
                        min_distance = dist;
                        best_satellite = sat_data;
                    end
                end
            end
        end
    end
end
