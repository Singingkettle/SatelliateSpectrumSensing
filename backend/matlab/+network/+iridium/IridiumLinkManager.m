classdef IridiumLinkManager < network.core.LinkManagerBase
    % IRIDIUMLINKMANAGER Link establishment manager for the Iridium constellation.
    % Implements Iridium-specific link establishment rules that support global coverage and low elevation angles.
    %
    % References:
    % [1] "Iridium System Engineering Overview" - Motorola Technical Report.
    %     - Describes its global coverage capability and support for links down to 8.2 degrees elevation.
    % [2] "Iridium NEXT System Overview" - IEEE Aerospace Conference 2012.
    %     - Confirms the basic orbital parameters and link characteristics of the system.

    methods
        function obj = IridiumLinkManager()
            % Constructor
            obj@network.core.LinkManagerBase('Iridium');
            obj.initialize_iridium_params();
        end

        function initialize_iridium_params(obj)
            % Initializes Iridium-specific network parameters.
            % Reference [1]
            obj.min_elevation_deg = 8.2;
            obj.max_range_km = 4000.0;
        end
    end

    methods (Access = protected)
        function best_satellite = select_best_satellite(obj, ground_station_data, satellites_data)
            % Selects the best Iridium satellite for a ground terminal.
            % Strategy: Select the satellite with the best signal quality, considering both elevation and distance.

            best_satellite = [];
            max_quality = -1;

            for i = 1:length(satellites_data)
                sat_data = satellites_data{i};
                
                [~, el, range_m] = obj.calculate_geometry(sat_data, ground_station_data);
                
                if el >= obj.min_elevation_deg
                    % Calculate a composite signal quality score
                    % Iridium focuses more on coverage, so distance has a slightly higher weight
                    elevation_score = el / 90;
                    distance_score = 1 - (range_m / (obj.max_range_km * 1000));
                    quality = 0.4 * elevation_score + 0.6 * distance_score;

                    if quality > max_quality
                        max_quality = quality;
                        best_satellite = sat_data;
                    end
                end
            end
        end
    end
end
