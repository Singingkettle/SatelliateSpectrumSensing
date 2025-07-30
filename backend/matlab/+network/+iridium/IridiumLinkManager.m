classdef IridiumLinkManager < network.core.LinkManagerBase
    % IRIDIUMLINKMANAGER Iridium星座的建链管理器
    % 实现Iridium特有的、支持全球覆盖和低仰角的建链规则。
    %
    % 参考文献:
    % [1] "Iridium System Engineering Overview" - Motorola Technical Report.
    %     - 描述了其全球覆盖能力和对低至8.2度仰角的链路支持。
    % [2] "Iridium NEXT System Overview" - IEEE Aerospace Conference 2012.
    %     - 确认了系统的基本轨道参数和链路特性。

    methods
        function obj = IridiumLinkManager()
            % 构造函数
            obj@network.core.LinkManagerBase('Iridium');
            obj.initialize_iridium_params();
        end

        function initialize_iridium_params(obj)
            % 初始化Iridium特定的网络参数
            % 参考文献 [1]
            obj.min_elevation_deg = 8.2;
            obj.max_range_km = 4000.0;
        end
    end

    methods (Access = protected)
        function best_satellite = select_best_satellite(obj, ground_station_data, satellites_data)
            % 为地面终端选择最佳的Iridium卫星
            % 策略：选择信号质量最佳的卫星，综合考虑仰角和距离。

            best_satellite = [];
            max_quality = -1;

            for i = 1:length(satellites_data)
                sat_data = satellites_data{i};
                
                [~, el, range_m] = obj.calculate_geometry(sat_data, ground_station_data);
                
                if el >= obj.min_elevation_deg
                    % 计算一个综合的信号质量分数
                    % Iridium更关注覆盖，因此距离权重稍高
                    elevation_score = el / 90;
                    distance_score = 1 - (range_m / (obj.max_range_km * 1000));
                    quality = 0.4 * elevation_score + 0.6 * distance_score;

                    if quality > max_quality
                        max_quality = quality;
                        best_satellite = sat_data;
                    end
                end
            end
        end
    end
end
