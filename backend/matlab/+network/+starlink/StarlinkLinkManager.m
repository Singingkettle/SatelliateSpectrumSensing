classdef StarlinkLinkManager < network.core.LinkManagerBase
    % STARLINQLINKMANAGER Starlink星座的建链管理器
    % 实现Starlink特定的星地建链规则，例如优先选择高仰角卫星。
    %
    % 参考文献:
    % [1] "Analysis of Starlink Satellite Constellation" - IEEE Access, 2021.
    %     - 论文中分析了Starlink的切换策略和对高仰角的偏好，以优化延迟和吞吐量。
    % [2] SpaceX Starlink System Overview - FCC Filing ITU-BR IFIC No. 2716.
    %     - 描述了系统架构，包括25度的最小仰角限制。

    properties (Access = private)
        handover_hysteresis_db = 3; % 切换迟滞, 3dB
    end

    methods
        function obj = StarlinkLinkManager()
            % 构造函数
            obj@network.core.LinkManagerBase('Starlink');
            obj.initialize_starlink_params();
        end

        function initialize_starlink_params(obj)
            % 初始化Starlink特定的网络参数
            % 参考文献 [2]
            obj.min_elevation_deg = 25.0;
            obj.max_range_km = 2000.0;
        end
    end

    methods (Access = protected)
        function best_satellite = select_best_satellite(obj, ground_station_data, satellites_data)
            % 为地面终端选择最佳的Starlink卫星（无状态版本）
            % 策略：优先选择仰角最高的卫星。
            % 输入:
            %   ground_station_data (struct): 单个地面站的数据
            %   satellites_data (cell): 包含所有可见卫星数据的cell数组

            best_satellite = [];
            max_elevation = -90; % 初始化为最低可能仰角

            for i = 1:length(satellites_data)
                sat_data = satellites_data{i};
                
                % 计算几何关系
                [az, el, range] = obj.calculate_geometry(sat_data, ground_station_data);

                % 检查是否满足最小仰角
                if el >= obj.min_elevation_deg
                    % 寻找仰角最高的卫星
                    if el > max_elevation
                        max_elevation = el;
                        best_satellite = sat_data;
                    end
                end
            end
        end
    end
end
