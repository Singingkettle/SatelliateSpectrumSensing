classdef ChannelModeler < handle
    % ChannelModeler 卫星信道建模器
    % 负责计算和应用各种传播效应，为物理层仿真提供精确的信道模型。
    % 功能包括自由空间路径损耗、大气损耗、降雨衰减等。
    %
    % 参考文献:
    % [1] ITU-R Recommendation P.618-13: "Propagation data and prediction
    %     methods for the planning of Earth-space telecommunication systems"
    %     https://www.itu.int/rec/R-REC-P.618-13/en
    % [2] ITU-R Recommendation P.676-12: "Attenuation by atmospheric gases"
    %     https://www.itu.int/rec/R-REC-P.676-12/en
    % [3] Pratt, T., Bostian, C. W., & Allnutt, J. E. (2003). Satellite Communications.
    %     John Wiley & Sons. Chapter 4 & 5.

    properties (Access = public)
        frequency_ghz % 工作频率 (GHz)
        elevation_deg % 仰角 (度)
        rain_rate_mmh = 5 % 降雨率 (mm/h)，默认值为中雨
    end

    methods

        function obj = ChannelModeler(freq_ghz, elevation_deg)
            % 构造函数
            % 输入:
            %   freq_ghz (double): 载波频率 (GHz)
            %   elevation_deg (double): 终端仰角 (度)
            if nargin > 0
                obj.frequency_ghz = freq_ghz;
                obj.elevation_deg = elevation_deg;
            end

        end

        function total_loss = calculate_total_loss(obj, distance_km)
            % 计算总传播损耗
            % 输入:
            %   distance_km (double): 星地距离 (km)
            % 输出:
            %   total_loss (double): 总损耗 (dB)

            fspl = obj.calculate_free_space_path_loss(distance_km);
            atm_loss = obj.calculate_atmospheric_loss();
            rain_loss = obj.calculate_rain_attenuation();

            total_loss = fspl + atm_loss + rain_loss;
        end

        function fspl = calculate_free_space_path_loss(obj, distance_km)
            % 计算自由空间路径损耗 (FSPL)
            % 公式依据参考文献 [3], 式 (4.7)
            % 输入:
            %   distance_km (double): 星地距离 (km)
            % 输出:
            %   fspl (double): 自由空间路径损耗 (dB)

            fspl = 20 * log10(distance_km) + 20 * log10(obj.frequency_ghz) + 92.45;
        end

        function atm_loss = calculate_atmospheric_loss(obj)
            % 计算大气损耗 (简化的ITU-R P.676模型)
            % 基于参考文献 [2] 中的图表和简化模型。
            % 输出:
            %   atm_loss (double): 大气损耗 (dB)

            % 氧气和水蒸气的比衰减 (dB/km)，基于ITU图表的简化拟合值
            f = obj.frequency_ghz;

            if f < 10
                gamma_o = 0.007;
                gamma_w = 0.002;
            elseif f < 40
                gamma_o = 0.01 + 0.001 * (f - 10);
                gamma_w = 0.005 + 0.004 * (f - 10);
            else
                gamma_o = 0.04;
                gamma_w = 0.08;
            end

            % 等效高度 (km)
            h_o = 6; % 氧气
            h_w = 2; % 水蒸气

            % 路径长度修正
            path_factor = 1 / sind(obj.elevation_deg);

            % 计算总损耗 (dB)
            atm_loss = (gamma_o * h_o + gamma_w * h_w) * path_factor;
        end

        function rain_loss = calculate_rain_attenuation(obj)
            % 计算降雨衰减 (简化的ITU-R P.618模型)
            % 基于参考文献 [1] 中的方法。
            % 输出:
            %   rain_loss (double): 降雨衰减 (dB)

            % 根据频率计算k和alpha系数 (来自ITU-R P.838-3)
            f = obj.frequency_ghz;

            if f < 20
                k = 4.21e-5 * f ^ 2.42;
                alpha = 1.41 * f ^ -0.0779;
            else
                k = 4.09e-2 * f ^ 0.699;
                alpha = 2.63 * f ^ -0.272;
            end

            % 计算特定衰减 (dB/km)
            specific_attenuation = k * obj.rain_rate_mmh ^ alpha;

            % 计算有效路径长度
            h_rain = 3.0; % 0度等温线高度 (km, 简化值)
            effective_path = (h_rain / sind(obj.elevation_deg));

            % 距离修正因子
            r_factor = 1 / (1 + effective_path / (35 * exp(-0.015 * obj.rain_rate_mmh)));

            rain_loss = specific_attenuation * effective_path * r_factor;
        end

    end

end
