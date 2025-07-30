function results = run_simulation_snapshot(params)
    % RUN_SIMULATION_SNAPSHOT Executes a multi-constellation network and physical layer simulation for a single scene snapshot.
    % This is the unified entry point for Python calls, iterating through all specified constellations and independently executing
    % the "network link establishment, then physical simulation" process for each.
    %
    % Input:
    %   params (struct): A structure containing the complete scene snapshot and configuration.
    %     - timestamp, samplingPeriod, constellations, satellites, groundStations

    try
        fprintf('--- Starting multi-constellation unified simulation process (Snapshot: %s) ---\n', params.timestamp);
        all_links = {};

        % --- Iterate through all constellations to be simulated ---
        for c = 1:length(params.constellations)
            constellation_config = params.constellations{c};
            constellation_name = constellation_config.name;
            fprintf('\n--- Processing constellation: %s ---\n', constellation_name);

            % --- 1. Network Layer Simulation: Determine valid links for this constellation ---
            fprintf('Step 1: Executing network layer simulation for %s...\n', constellation_name);
            link_manager = network.core.LinkManagerFactory.createLinkManager(constellation_name);
            
            % Get the dedicated satellite and terminal lists from this constellation's configuration
            if ~isfield(constellation_config, 'satellites') || ~isfield(constellation_config, 'groundStations')
                fprintf('Warning: Missing satellites or groundStations field in the configuration for %s, skipping this constellation.\n', constellation_name);
                continue;
            end
            snapshot.satellites = constellation_config.satellites;
            snapshot.ground_stations = constellation_config.groundStations;
            active_links = link_manager.get_links_for_snapshot(snapshot);
            
            if isempty(active_links)
                fprintf('No valid links found in the %s constellation.\n', constellation_name);
                continue; % Continue to the next constellation
            end
            fprintf('Found %d valid links for %s.\n', length(active_links), constellation_name);

            % --- 2. Physical Layer Simulation: Analyze each valid link for this constellation ---
            fprintf('Step 2: Executing physical layer simulation for the links of %s...\n', constellation_name);
            
            % Dynamically instantiate the corresponding physical layer model (currently only Starlink is implemented)
            switch lower(constellation_name)
                case 'starlink'
                    phy_layer = physical.starlink.StarlinkPhysicalLayer(constellation_config.shell);
                case 'oneweb'
                    phy_layer = physical.oneweb.OneWebPhysicalLayer();
                case 'iridium'
                    phy_layer = physical.iridium.IridiumPhysicalLayer();
                otherwise
                    fprintf('Warning: The physical layer model for %s has not been implemented, skipping physical layer analysis.\n', constellation_name);
                    phy_layer = [];
            end

            if ~isempty(phy_layer)
                for i = 1:length(active_links)
                    link = active_links{i};
                    link_budget = phy_layer.calculate_link_budget(link.range_km, link.elevation_deg);
                    snr_db = link_budget.snr_db;
                    
                    tx_iq = phy_layer.generate_iq_signal('downlink', params.samplingPeriod, phy_layer.bandwidth_mhz * 1e6);
                    total_loss_linear = 10^(link_budget.total_loss_db / 10);
                    signal_at_rx_no_noise = tx_iq / sqrt(total_loss_linear);
                    rx_iq = phy_layer.apply_rx_effects(signal_at_rx_no_noise, snr_db);

                    link.physical_results = struct();
                    link.physical_results.link_budget = link_budget;
                    link.physical_results.redis_key = sprintf('%s:%s:%s:IQ', params.timestamp, link.satellite.name, link.ground_station.name);
                    max_samples = 500;
                    link.physical_results.rx_iq_data = struct('i', real(rx_iq(1:min(end, max_samples))), 'q', imag(rx_iq(1:min(end, max_samples))));
                    active_links{i} = link;
                end
            end
            all_links = [all_links, active_links];
        end

        % --- 3. Format the final output results ---
        simplified_links = {};
        for i=1:length(all_links)
            link = all_links{i};
            s_link = struct();
            s_link.satellite_name = link.satellite.name;
            s_link.ground_station_name = link.ground_station.name;
            s_link.azimuth_deg = link.azimuth_deg;
            s_link.elevation_deg = link.elevation_deg;
            s_link.range_km = link.range_km;
            if isfield(link, 'physical_results')
                s_link.physical_results = link.physical_results;
            end
            simplified_links{end+1} = s_link;
        end

        results = struct('status', 'success', 'message', 'Multi-constellation simulation completed successfully', 'links', {simplified_links});

    catch ME
        fprintf(2, 'An error occurred in the unified simulation process: %s\n', ME.message);
        fprintf(2, 'Error occurred in file %s at line %d\n', ME.stack(1).file, ME.stack(1).line);
        results = struct('status', 'error', 'message', ME.message);
    end
end