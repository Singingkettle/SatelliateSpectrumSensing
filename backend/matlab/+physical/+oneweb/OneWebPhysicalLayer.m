classdef OneWebPhysicalLayer < handle
    % ONEWEBPHYSICALLAYER Physical layer implementation for the OneWeb constellation.
    % Responsible for managing OneWeb-specific physical layer parameters (Ka-band) and related calculations.
    %
    % References:
    % [1] OneWeb System Overview - ITU Filing RR Section 9.11A.
    %     - Provides a system overview, including frequency bands and orbital parameters.
    % [2] OneWeb FCC Form 312 Application - File No. SAT-LOI-20160428-00041.
    %     - Describes technical characteristics in detail, including modulation and coding schemes.

    properties (Access = public)
        orbital_altitude_km, carrier_frequency_ghz, bandwidth_mhz, 
        modulation_scheme, coding_scheme, satellite_eirp_dbw, terminal_g_t_dbk, channel_modeler
    end

    methods
        function obj = OneWebPhysicalLayer()
            obj.initialize_parameters();
        end

        function initialize_parameters(obj)
            % Initializes OneWeb-specific parameters (References [1], [2])
            obj.orbital_altitude_km = 1200;
            obj.carrier_frequency_ghz = 19.7; % Ka-band downlink center frequency
            obj.bandwidth_mhz = 125;
            obj.modulation_scheme = '16QAM';
            obj.coding_scheme = 'LDPC_2/3';
            obj.satellite_eirp_dbw = 48.0; % Estimated value
            obj.terminal_g_t_dbk = 15.0; % G/T value for high-performance terminals
            obj.channel_modeler = physical.core.ChannelModeler(obj.carrier_frequency_ghz, 45);
        end

        function iq_data = generate_iq_signal(obj, ~, duration_sec, sample_rate_hz)
            % Generates a 16-QAM signal (using modern System Objects)
            sps = 4; % Samples per symbol
            num_samples_to_keep = round(duration_sec * sample_rate_hz);
            num_symbols = ceil(num_samples_to_keep / sps);

            data_in = randi([0 15], num_symbols, 1);
            symbols_in = qammod(data_in, 16, 'UnitAveragePower', true);

            % Use RaisedCosineTransmitFilter for pulse shaping
            tx_filter = comm.RaisedCosineTransmitFilter(...
                'Shape', 'Square root', ...
                'RolloffFactor', 0.3, ...
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
