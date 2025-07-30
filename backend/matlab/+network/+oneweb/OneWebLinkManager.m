classdef OneWebLinkManager < network.core.LinkManagerBase
    % ONEWEBLINKMANAGER Link establishment manager for the OneWeb constellation.
    % Implements OneWeb-specific, geographic cell-based link establishment rules.
    %
    % References:
    % [1] "OneWeb Satellite Constellation Architecture" - IEEE MILCOM 2018.
    %     - Describes its fixed-beam coverage strategy based on geographic cells.
    % [2] OneWeb System Overview - ITU Filing RR Section 9.11A.
    %     - Provides system parameters such as minimum elevation angle.

    methods
        function obj = OneWebLinkManager()
            % Constructor
            obj@network.core.LinkManagerBase('OneWeb');
            obj.initialize_oneweb_params();
        end

        function initialize_oneweb_params(obj)
            % Initializes OneWeb-specific network parameters.
            % Reference [2]
            obj.min_elevation_deg = 30.0;
            obj.max_range_km = 1500.0;
        end
    end

    methods (Access = protected)
        function best_satellite = select_best_satellite(obj, ground_station_data, satellites_data)
            % Selects the best OneWeb satellite for a ground terminal.
            % Strategy: Select the satellite with the closest sub-satellite point to simulate its geographic cell strategy.
            % Reference [1]

            best_satellite = [];
            min_distance = inf;

            for i = 1:length(satellites_data)
                sat_data = satellites_data{i};
                
                % Check if the satellite is visible
                [~, el, ~] = obj.calculate_geometry(sat_data, ground_station_data);
                if el >= obj.min_elevation_deg
                    % Calculate the spherical distance from the ground station to the satellite's sub-satellite point
                    dist = distance(ground_station_data.latitude, ground_station_data.longitude, ...
                                    sat_data.latitude, sat_data.longitude, ...
                                    wgs84Ellipsoid('km'));

                    if dist < min_distance
                        min_distance = dist;
                        best_satellite = sat_data;
                    end
                end
            end
        end
    end
end
