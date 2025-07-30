classdef LinkManagerFactory
    % LINKMANAGERFACTORY 链路管理器工厂类
    % 根据星座类型创建相应的链路管理器实例。

    methods (Static)
        function manager = createLinkManager(constellation_name)
            % 创建链路管理器
            % 输入:
            %   constellation_name (char): 星座名称 ('Starlink', 'OneWeb', 'Iridium')
            % 输出:
            %   manager: 对应的链路管理器实例

            switch lower(constellation_name)
                case 'starlink'
                    manager = network.starlink.StarlinkLinkManager();
                case 'oneweb'
                    manager = network.oneweb.OneWebLinkManager();
                case 'iridium'
                    manager = network.iridium.IridiumLinkManager();
                otherwise
                    error('LinkManagerFactory:UnsupportedConstellation', ...
                        '不支持的星座类型: %s', constellation_name);
            end
        end
    end
end
