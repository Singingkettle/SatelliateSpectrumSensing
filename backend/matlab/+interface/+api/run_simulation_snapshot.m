function results = run_simulation_snapshot(params)
    % RUN_SIMULATION_SNAPSHOT 对单个场景快照执行多星座网络和物理层仿真
    % 这是Python调用的统一入口点，遍历所有指定的星座，并对每个星座独立执行
    % “先网络建链，后物理仿真”的流程。
    %
    % 输入:
    %   params (struct): 包含完整场景快照和配置的结构体。
    %     - timestamp, samplingPeriod, constellations, satellites, groundStations

    try
        fprintf('--- 开始多星座统一仿真流程 (快照: %s) ---\n', params.timestamp);
        all_links = {};

        % --- 遍历所有需要仿真的星座 ---
        for c = 1:length(params.constellations)
            constellation_config = params.constellations{c};
            constellation_name = constellation_config.name;
            fprintf('\n--- 正在处理星座: %s ---\n', constellation_name);

            % --- 1. 网络层仿真：确定该星座的有效链路 ---
            fprintf('步骤 1: 为 %s 执行网络层仿真...\n', constellation_name);
            link_manager = network.core.LinkManagerFactory.createLinkManager(constellation_name);
            
            % 从该星座的配置中获取其专属的卫星和终端列表
            if ~isfield(constellation_config, 'satellites') || ~isfield(constellation_config, 'groundStations')
                fprintf('警告: %s 的配置中缺少 satellites 或 groundStations 字段，跳过该星座。\n', constellation_name);
                continue;
            end
            snapshot.satellites = constellation_config.satellites;
            snapshot.ground_stations = constellation_config.groundStations;
            active_links = link_manager.get_links_for_snapshot(snapshot);
            
            if isempty(active_links)
                fprintf('在 %s 星座中未找到有效链路。\n', constellation_name);
                continue; % 继续处理下一个星座
            end
            fprintf('为 %s 找到 %d 个有效链路。\n', constellation_name, length(active_links));

            % --- 2. 物理层仿真：对该星座的每个有效链路进行分析 ---
            fprintf('步骤 2: 为 %s 的链路执行物理层仿真...\n', constellation_name);
            
            % 动态实例化对应的物理层模型 (当前仅实现Starlink)
            switch lower(constellation_name)
                case 'starlink'
                    phy_layer = physical.starlink.StarlinkPhysicalLayer(constellation_config.shell);
                case 'oneweb'
                    phy_layer = physical.oneweb.OneWebPhysicalLayer();
                case 'iridium'
                    phy_layer = physical.iridium.IridiumPhysicalLayer();
                otherwise
                    fprintf('警告: %s 的物理层模型尚未实现，将跳过物理层分析。\n', constellation_name);
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

        % --- 3. 格式化最终输出结果 ---
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

        results = struct('status', 'success', 'message', '多星座仿真成功完成', 'links', {simplified_links});

    catch ME
        fprintf(2, '统一仿真流程发生错误: %s\n', ME.message);
        fprintf(2, '错误发生在文件 %s 的第 %d 行\n', ME.stack(1).file, ME.stack(1).line);
        results = struct('status', 'error', 'message', ME.message);
    end
end