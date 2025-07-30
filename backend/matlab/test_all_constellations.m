% TEST_ALL_CONSTELLATIONS - 测试所有星座的统一仿真流程

function test_all_constellations()
    fprintf('--- 开始执行所有星座的统一仿真测试脚本 ---\n');

    % 1. 添加路径
    addpath(genpath(fullfile(pwd, '..', 'matlab')));

    % 2. 定义顶层参数
    params.timestamp = '2025-07-16T10:00:00Z';
    params.samplingPeriod = 0.001; % 1ms
    
    % --- 3. 定义所有星座及其资源 ---
    starlink_cfg.name = 'Starlink';
    starlink_cfg.shell = 'Shell1';
    starlink_cfg.satellites = { struct('name', 'Starlink_1', 'latitude', 53.0, 'longitude', 13.0, 'altitude', 551) };
    starlink_cfg.groundStations = { struct('name', 'GS_Berlin', 'latitude', 52.5, 'longitude', 13.4) };

    oneweb_cfg.name = 'OneWeb';
    oneweb_cfg.satellites = { struct('name', 'OneWeb_1', 'latitude', 60.0, 'longitude', 15.0, 'altitude', 1200) };
    oneweb_cfg.groundStations = { struct('name', 'GS_Oslo', 'latitude', 59.9, 'longitude', 10.7) };

    iridium_cfg.name = 'Iridium';
    iridium_cfg.satellites = { struct('name', 'Iridium_1', 'latitude', 65.0, 'longitude', 20.0, 'altitude', 780) };
    iridium_cfg.groundStations = { struct('name', 'GS_Reykjavik', 'latitude', 64.1, 'longitude', -21.9) };

    params.constellations = {starlink_cfg, oneweb_cfg, iridium_cfg};

    % 4. 调用统一仿真接口
    results = interface.api.run_simulation_snapshot(params);

    % 5. 显示结果
    fprintf('\n--- 测试结果 ---\n');
    disp(results);

    if strcmp(results.status, 'success')
        fprintf('\n[SUCCESS] 测试成功！\n');
        if isfield(results, 'links') && ~isempty(results.links)
            fprintf('共找到并分析了 %d 个链路。\n', length(results.links));
            disp(results.links);
        end
    end
end
