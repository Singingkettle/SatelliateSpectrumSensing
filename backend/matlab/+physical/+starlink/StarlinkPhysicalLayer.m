classdef StarlinkPhysicalLayer < handle
    % STARLINKPHYSICALLAYER Starlink星座的物理层实现
    % 负责管理Starlink特有的物理层参数，并进行链路预算和信噪比(SNR)等计算。
    %
    % 参考文献:
    % [1] Humphreys, T. E., et al. "Signal Structure of the Starlink Ku-Band
    %     Downlink." ION GNSS+ 2023.
    % [2] FCC Application: SpaceX Non-Geostationary Satellite System, 2016-2018
    % [3] Pratt, T., Bostian, C. W., & Allnutt, J. E. (2003). Satellite Communications.

    properties (Access = public)
        shell_name, orbital_altitude_km, carrier_frequency_ghz, bandwidth_mhz,
        modulation_scheme, coding_scheme, satellite_eirp_dbw, terminal_g_t_dbk, channel_modeler
    end

    methods

        function obj = StarlinkPhysicalLayer(shell_name)
            if nargin < 1, shell_name = 'Shell1'; end
            obj.shell_name = shell_name;
            obj.initialize_parameters(shell_name);
        end

        function initialize_parameters(obj, shell_name)

            switch shell_name
                case 'Shell1'
                    obj.orbital_altitude_km = 550;
                    obj.carrier_frequency_ghz = 12.2;
                    obj.bandwidth_mhz = 240;
                    obj.modulation_scheme = 'OFDM';
                    obj.coding_scheme = 'LDPC_3/4';
                    obj.satellite_eirp_dbw = 45.0;
                    obj.terminal_g_t_dbk = 14.5;
                otherwise , error('不支持的Starlink外壳: %s', shell_name);
            end

            obj.channel_modeler = physical.core.ChannelModeler(obj.carrier_frequency_ghz, 45);
        end

        function iq_data = generate_iq_signal(obj, direction, duration_sec, sample_rate_hz)
            % 参考文献:
            % [1] Proakis, J. G., & Salehi, M. (2008). Digital Communications.
            % [2] Humphreys, T. E., et al. "Signal Structure of the Starlink Ku-Band Downlink." ION GNSS+ 2023.
            % [3] FCC Application SAT-LOA-20161115-00118

            num_samples = round(duration_sec * sample_rate_hz);

            if strcmpi(direction, 'downlink')
                ofdm_mod = comm.OFDMModulator('FFTLength', 1024, ...
                                            'NumGuardBandCarriers', [112; 111], ...
                                            'InsertDCNull', true, ...
                                            'CyclicPrefixLength', 64, ...
                                            'NumSymbols', ceil(num_samples / (1024+64)));
                
                % 使用info()方法获取调制器信息，以兼容不同MATLAB版本
                mod_info = info(ofdm_mod);

                % Starlink使用自适应调制，这里以16-QAM为例
                data_in = randi([0 15], mod_info.DataInputSize(1), ofdm_mod.NumSymbols);
                symbols_in = qammod(data_in, 16, 'UnitAveragePower', true);
                iq_data = ofdm_mod(symbols_in);
            elseif strcmpi(direction, 'uplink')
                sps = 8;
                num_symbols = ceil(num_samples / sps);
                data_in = randi([0 3], num_symbols, 1);
                symbols_in = pskmod(data_in, 4, pi / 4, 'gray');
                rrc_filter = rcosdesign(0.25, 8, sps, 'sqrt');
                iq_data = upfirdn(symbols_in, rrc_filter, sps);
            else 
                error('无效的方向: %s. 请使用 ''uplink'' 或 ''downlink''。', direction);
            end

            iq_data = iq_data(1:num_samples);
        end

        function rx_signal = apply_rx_effects(obj, signal, snr_db)
            % 参考文献:
            % [1] Goldsmith, A. (2005). Wireless Communications.
            rx_signal = awgn(signal, snr_db, 'measured');
        end

        function link_budget = calculate_link_budget(obj, distance_km, elevation_deg)
            obj.channel_modeler.elevation_deg = elevation_deg;
            path_loss_db = obj.channel_modeler.calculate_free_space_path_loss(distance_km);
            atmospheric_loss_db = obj.channel_modeler.calculate_atmospheric_loss();
            rain_loss_db = obj.channel_modeler.calculate_rain_attenuation();
            total_loss_db = path_loss_db + atmospheric_loss_db + rain_loss_db;
            rx_power_dbw = obj.satellite_eirp_dbw - total_loss_db;
            k_boltzmann = -228.6;
            carrier_to_noise_density_dbhz = rx_power_dbw - obj.terminal_g_t_dbk - k_boltzmann;
            bandwidth_dbhz = 10 * log10(obj.bandwidth_mhz * 1e6);
            snr_db = carrier_to_noise_density_dbhz - bandwidth_dbhz;
            link_budget = struct('distance_km', distance_km, 'elevation_deg', elevation_deg, 'path_loss_db', path_loss_db, 'atmospheric_loss_db', atmospheric_loss_db, 'rain_loss_db', rain_loss_db, 'total_loss_db', total_loss_db, 'rx_power_dbw', rx_power_dbw, 'snr_db', snr_db);
        end

    end

end
