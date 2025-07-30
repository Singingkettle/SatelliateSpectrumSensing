classdef LinkManagerBase < handle
    % LINKMANAGERBASE Base class for satellite-ground link establishment managers.
    % Defines the common interface and basic functionalities for link establishment simulations.
    % All constellation-specific link establishment rules are implemented by inheriting from this base class.
    %
    % References:
    % [1] "Satellite Communications" by Timothy Pratt, Charles W. Bostian, Jeremy E. Allnutt.
    %     - Provides the fundamental theory of link establishment and handover.
    % [2] "LEO Satellite Communication Networks" by Riccardo de Gaudenzi, et al.
    %     - Discusses the network topology and routing challenges of different LEO constellations.

    properties (Access = protected)
        active_links      % List of currently active links
        link_history      % Historical record of links
    end

    properties (Access = public)
        constellation_name    % Constellation name
        min_elevation_deg     % Minimum elevation angle (degrees)
        max_range_km          % Maximum communication distance (km)
    end

    methods
        function obj = LinkManagerBase(constellation_name)
            % Constructor
            % Input:
            %   constellation_name (char): The name of the constellation
            obj.constellation_name = constellation_name;
            obj.active_links = {};
            obj.link_history = {};
            
            % Set common default values, which can be overridden by subclasses
            obj.min_elevation_deg = 10;
            obj.max_range_km = 2500;
        end

        function active_links = get_links_for_snapshot(obj, snapshot)
            % Calculates and returns the active links for the current moment based on a scene snapshot.
            % This is the main stateless interface method for external calls.
            % Input:
            %   snapshot (struct): A structure containing the state of all objects at the current moment.
            %     - satellites (cell): {struct('name', 'id', 'latitude', lat, 'longitude', lon, 'altitude', alt)}
            %     - ground_stations (cell): {struct('name', 'id', 'latitude', lat, 'longitude', lon)}
            % Output:
            %   active_links (cell): A list of the calculated active links.

            % Filter out the satellites belonging to this constellation
            constellation_sats = obj.filter_constellation_satellites(snapshot.satellites);

            if isempty(constellation_sats)
                active_links = {};
                return;
            end

            active_links = {};
            % Find the best connection for each ground terminal
            for i = 1:length(snapshot.ground_stations)
                gs_data = snapshot.ground_stations{i};

                % Call the specific select_best_satellite method implemented by the subclass
                best_satellite_data = obj.select_best_satellite(gs_data, constellation_sats);

                if ~isempty(best_satellite_data)
                    link = obj.create_link(best_satellite_data, gs_data);
                    if ~isempty(link)
                        active_links{end + 1} = link;
                    end
                end
            end
        end

        function is_visible = is_visible(obj, satellite, ground_station)
            % Checks if a satellite is visible to a ground station (satisfies basic geometric conditions).
            % Output:
            %   is_visible (logical): Whether it is visible
            is_visible = false;
            try
                [~, elevation, range_m] = aer(satellite, ground_station, obj.scenario.SimulationTime);
                if elevation >= obj.min_elevation_deg && (range_m/1000) <= obj.max_range_km
                    is_visible = true;
                end
            catch ME
                warning('Could not calculate geometric relationship %s -> %s: %s', satellite.Name, ground_station.Name, ME.message);
            end
        end
        
        function active_links = get_active_links(obj)
            % Gets the list of currently active links.
            active_links = obj.active_links;
        end

    function [az, el, slantRange] = calculate_geometry(obj, sat_data, gs_data)
            % Calculates the geometric relationship between a satellite and a ground station (stateless).
            % Uses the lla2aer function for calculation and enforces type conversion to ensure compatibility.
            % Input:
            %   sat_data (struct): Satellite data {latitude, longitude, altitude}
            %   gs_data (struct): Ground station data {latitude, longitude}
            % Output:
            %   az (double): Azimuth angle (degrees)
            %   el (double): Elevation angle (degrees)
            %   slantRange (double): Slant range (meters)
            gs_alt = 0; % Assume ground station altitude is 0
            if isfield(gs_data, 'altitude') && ~isempty(gs_data.altitude)
                gs_alt = gs_data.altitude;
            end

            % Enforce conversion of all inputs to double to prevent Python->MATLAB type issues
            sat_lat = double(sat_data.latitude);
            sat_lon = double(sat_data.longitude);
            sat_alt_m = double(sat_data.altitude) * 1000; % Convert altitude to meters
            gs_lat = double(gs_data.latitude);
            gs_lon = double(gs_data.longitude);
            gs_alt_m = double(gs_alt);

            [az, el, slantRange] = geodetic2aer(sat_lat, sat_lon, sat_alt_m, ...
                                                gs_lat, gs_lon, gs_alt_m, ...
                                                wgs84Ellipsoid('meter'));
        end
    end

    methods (Abstract, Access = protected)
        % Abstract method - must be implemented by subclasses
        best_satellite = select_best_satellite(obj, ground_station, satellites)
    end
    
    methods (Access = private)
        function constellation_sats = filter_constellation_satellites(obj, all_satellites_data)
            % Filters out the satellites belonging to this constellation.
            % Input: all_satellites_data (cell) - a cell array of satellite data structures
            
            % Extract all satellite names from the cell array
            names = cell(1, length(all_satellites_data));
            for i = 1:length(all_satellites_data)
                if isfield(all_satellites_data{i}, 'name')
                    names{i} = all_satellites_data{i}.name;
                else
                    names{i} = ''; % Empty if no name field
                end
            end

            is_member = contains(names, obj.constellation_name, 'IgnoreCase', true);
            constellation_sats = all_satellites_data(is_member);
        end

        function link = create_link(obj, satellite_data, ground_station_data)
            % Creates a standard link information structure (stateless version).
            link = [];
            try
                % Use the stateless geometry calculation function
                [az, el, r_m] = obj.calculate_geometry(satellite_data, ground_station_data);
                
                link = struct(... 
                    'id', sprintf('%s_to_%s', satellite_data.name, ground_station_data.name), ...
                    'satellite', satellite_data, ...
                    'ground_station', ground_station_data, ...
                    'azimuth_deg', az, ...
                    'elevation_deg', el, ...
                    'range_km', r_m / 1000 ...
                );
            catch ME
                 warning('Failed to create link %s -> %s: %s', satellite_data.name, ground_station_data.name, ME.message);
            end
        end

        function update_active_link_list(obj, new_links)
            % Updates the active link list and archives old links.
            for i = 1:length(obj.active_links)
                old_link = obj.active_links{i};
                old_link.is_active = false;
                old_link.termination_time = obj.scenario.SimulationTime;
                obj.link_history{end+1} = old_link;
            end
            obj.active_links = new_links;
        end
    end
end
