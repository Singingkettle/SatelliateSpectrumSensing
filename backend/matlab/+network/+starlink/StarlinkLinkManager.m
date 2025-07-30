classdef StarlinkLinkManager < network.core.LinkManagerBase
    % STARLINQLINKMANAGER Link establishment manager for the Starlink constellation.
    % Implements Starlink-specific satellite-ground link establishment rules, such as prioritizing high-elevation satellites.
    %
    % References:
    % [1] "Analysis of Starlink Satellite Constellation" - IEEE Access, 2021.
    %     - The paper analyzes Starlink's handover strategy and preference for high elevation angles to optimize latency and throughput.
    % [2] SpaceX Starlink System Overview - FCC Filing ITU-BR IFIC No. 2716.
    %     - Describes the system architecture, including the 25-degree minimum elevation angle limit.

    properties (Access = private)
        handover_hysteresis_db = 3; % Handover hysteresis, 3dB
    end

    methods
        function obj = StarlinkLinkManager()
            % Constructor
            obj@network.core.LinkManagerBase('Starlink');
            obj.initialize_starlink_params();
        end

        function initialize_starlink_params(obj)
            % Initializes Starlink-specific network parameters.
            % Reference [2]
            obj.min_elevation_deg = 25.0;
            obj.max_range_km = 2000.0;
        end
    end

    methods (Access = protected)
        function best_satellite = select_best_satellite(obj, ground_station_data, satellites_data)
            % Selects the best Starlink satellite for a ground terminal (stateless version).
            % Strategy: Prioritize the satellite with the highest elevation angle.
            % Input:
            %   ground_station_data (struct): Data for a single ground station
            %   satellites_data (cell): A cell array containing data for all visible satellites

            best_satellite = [];
            max_elevation = -90; % Initialize to the lowest possible elevation angle

            for i = 1:length(satellites_data)
                sat_data = satellites_data{i};
                
                % Calculate geometric relationship
                [az, el, range] = obj.calculate_geometry(sat_data, ground_station_data);

                % Check if it meets the minimum elevation angle
                if el >= obj.min_elevation_deg
                    % Find the satellite with the highest elevation angle
                    if el > max_elevation
                        max_elevation = el;
                        best_satellite = sat_data;
                    end
                end
            end
        end
    end
end
