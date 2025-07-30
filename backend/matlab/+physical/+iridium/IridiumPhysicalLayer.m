classdef IridiumPhysicalLayer < handle
    % IRIDIUMPHYSICALLAYER Physical layer implementation for the Iridium constellation.
    % Responsible for managing Iridium-specific physical layer parameters (L-band) and related calculations.
    %
    % References:
    % [1] "Iridium System Engineering Overview" - Motorola Technical Report.
    % [2] "Iridium NEXT System Overview" - IEEE Aerospace Conference 2012.

    properties (Access = public)
        orbital_altitude_km, carrier_frequency_ghz, bandwidth_mhz, 
        modulation_scheme, coding_scheme, satellite_eirp_dbw, terminal_g_t_dbk, channel_modeler
    end

    methods
        function obj = IridiumPhysicalLayer()
            obj.initialize_parameters();
        end

        function initialize_parameters(obj)
            % Initializes Iridium-specific parameters (References [1], [2])
            obj.orbital_altitude_km = 780;
            obj.carrier_frequency_ghz = 1.62; % L-band
            obj.bandwidth_mhz = 0.0315; % 31.5 kHz
            obj.modulation_scheme = 'QPSK';
            obj.coding_scheme = 'BCH';
            obj.satellite_eirp_dbw = 16.0; % Estimated value
            obj.terminal_g_t_dbk = -15.0; % G/T value for handheld terminals
            obj.channel_modeler = physical.core.ChannelModeler(obj.carrier_frequency_ghz, 45);
        end

        function iq_data = generate_iq_signal(obj, ~, duration_sec, sample_rate_hz)
            % Generates a QPSK signal (using modern System Objects)
            sps = 4; % Samples per symbol
            num_samples_to_keep = round(duration_sec * sample_rate_hz);
            num_symbols = ceil(num_samples_to_keep / sps);
            
            data_in = randi([0 3], num_symbols, 1);
            symbols_in = pskmod(data_in, 4, pi/4, 'gray');
            
            % Use RaisedCosineTransmitFilter for pulse shaping, which is more robust
            tx_filter = comm.RaisedCosineTransmitFilter(...
                'Shape', 'Square root', ...
                'RolloffFactor', 0.4, ...
                'FilterSpanInSymbols', 6, ...
                'OutputSamplesPerSymbol', sps);
                
            iq_data = tx_filter(symbols_in);
            
            % Trim or pad to the exact number of samples
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
            rain_loss_db = 0; % Rain attenuation is negligible in the L-band
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
