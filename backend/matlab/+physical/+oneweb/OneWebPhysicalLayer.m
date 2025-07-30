classdef OneWebPhysicalLayer < handle
    % ONEWEBPHYSICALLAYER OneWeb星座的物理层实现
    % 负责管理OneWeb特有的物理层参数（Ka波段）和相关计算。
    %
    % 参考文献:
    % [1] OneWeb System Overview - ITU Filing RR Section 9.11A.
    %     - 提供了系统概览，包括频段和轨道参数。
    % [2] OneWeb FCC Form 312 Application - File No. SAT-LOI-20160428-00041.
    %     - 详细描述了技术特性，包括调制和编码方案。

    properties (Access = public)
        orbital_altitude_km, carrier_frequency_ghz, bandwidth_mhz, 
        modulation_scheme, coding_scheme, satellite_eirp_dbw, terminal_g_t_dbk, channel_modeler
    end

    methods
        function obj = OneWebPhysicalLayer()
            obj.initialize_parameters();
        end

        function initialize_parameters(obj)
            % 初始化OneWeb特定参数 (参考 [1], [2])
            obj.orbital_altitude_km = 1200;
            obj.carrier_frequency_ghz = 19.7; % Ka波段下行链路中心频率
            obj.bandwidth_mhz = 125;
            obj.modulation_scheme = '16QAM';
            obj.coding_scheme = 'LDPC_2/3';
            obj.satellite_eirp_dbw = 48.0; % 估算值
            obj.terminal_g_t_dbk = 15.0; % 高性能终端G/T值
            obj.channel_modeler = physical.core.ChannelModeler(obj.carrier_frequency_ghz, 45);
        end

        function iq_data = generate_iq_signal(obj, ~, duration_sec, sample_rate_hz)
            % 生成16-QAM信号 (使用现代的System Object)
            sps = 4; % 每个符号的采样数
            num_samples_to_keep = round(duration_sec * sample_rate_hz);
            num_symbols = ceil(num_samples_to_keep / sps);

            data_in = randi([0 15], num_symbols, 1);
            symbols_in = qammod(data_in, 16, 'UnitAveragePower', true);

            % 使用RaisedCosineTransmitFilter进行脉冲成形
            tx_filter = comm.RaisedCosineTransmitFilter(...
                'Shape', 'Square root', ...
                'RolloffFactor', 0.3, ...
                'FilterSpanInSymbols', 6, ...
                'OutputSamplesPerSymbol', sps);

            iq_data = tx_filter(symbols_in);

            % 裁剪或填充到精确的样本数
            if length(iq_data) >= num_samples_to_keep
                iq_data = iq_data(1:num_samples_to_keep);
            else
                iq_data = [iq_data; zeros(num_samples_to_keep - length(iq_data), 1)];
            end
        end

        function rx_signal = apply_rx_effects(obj, signal, snr_db)
            rx_signal = awgn(signal, snr_db, 'measured');
        end

        function link_budget = calculate_link_budget(obj, distance_km, elevation_deg)
            obj.channel_modeler.elevation_deg = elevation_deg;
            obj.channel_modeler.frequency_ghz = obj.carrier_frequency_ghz;
            path_loss_db = obj.channel_modeler.calculate_free_space_path_loss(distance_km);
            atmospheric_loss_db = obj.channel_modeler.calculate_atmospheric_loss();
            rain_loss_db = obj.channel_modeler.calculate_rain_attenuation();
            total_loss_db = path_loss_db + atmospheric_loss_db + rain_loss_db;
            rx_power_dbw = obj.satellite_eirp_dbw - total_loss_db;
            k_boltzmann = -228.6;
            carrier_to_noise_density_dbhz = rx_power_dbw - obj.terminal_g_t_dbk - k_boltzmann;
            bandwidth_dbhz = 10 * log10(obj.bandwidth_mhz * 1e6);
            snr_db = carrier_to_noise_density_dbhz - bandwidth_dbhz;
            link_budget = struct('snr_db', snr_db, 'total_loss_db', total_loss_db);
        end
    end
end
