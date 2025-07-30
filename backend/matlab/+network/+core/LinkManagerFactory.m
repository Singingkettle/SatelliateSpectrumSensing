classdef LinkManagerFactory
    % LINKMANAGERFACTORY Factory class for link managers.
    % Creates the appropriate link manager instance based on the constellation type.

    methods (Static)
        function manager = createLinkManager(constellation_name)
            % Creates a link manager.
            % Input:
            %   constellation_name (char): The name of the constellation ('Starlink', 'OneWeb', 'Iridium')
            % Output:
            %   manager: The corresponding link manager instance.

            switch lower(constellation_name)
                case 'starlink'
                    manager = network.starlink.StarlinkLinkManager();
                case 'oneweb'
                    manager = network.oneweb.OneWebLinkManager();
                case 'iridium'
                    manager = network.iridium.IridiumLinkManager();
                otherwise
                    error('LinkManagerFactory:UnsupportedConstellation', ...
                        'Unsupported constellation type: %s', constellation_name);
            end
        end
    end
end
