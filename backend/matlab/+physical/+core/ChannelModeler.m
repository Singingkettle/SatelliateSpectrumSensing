classdef ChannelModeler < handle
    % ChannelModeler Satellite channel modeler
    % Responsible for calculating and applying various propagation effects, providing an accurate channel model for physical layer simulations.
    % Functions include free-space path loss, atmospheric loss, rain attenuation, etc.
    %
    % References:
    % [1] ITU-R Recommendation P.618-13: "Propagation data and prediction
    %     methods for the planning of Earth-space telecommunication systems"
    %     https://www.itu.int/rec/R-REC-P.618-13/en
    % [2] ITU-R Recommendation P.676-12: "Attenuation by atmospheric gases"
    %     https://www.itu.int/rec/R-REC-P.676-12/en
    % [3] Pratt, T., Bostian, C. W., & Allnutt, J. E. (2003). Satellite Communications.
    %     John Wiley & Sons. Chapter 4 & 5.

    properties (Access = public)
        frequency_ghz % Operating frequency (GHz)
        elevation_deg % Elevation angle (degrees)
        rain_rate_mmh = 5 % Rain rate (mm/h), default value for moderate rain
    end

    methods

        function obj = ChannelModeler(freq_ghz, elevation_deg)
            % Constructor
            % Input:
            %   freq_ghz (double): Carrier frequency (GHz)
            %   elevation_deg (double): Terminal elevation angle (degrees)
            if nargin > 0
                obj.frequency_ghz = freq_ghz;
                obj.elevation_deg = elevation_deg;
            end

        end

        function total_loss = calculate_total_loss(obj, distance_km)
            % Calculates the total propagation loss.
            % Input:
            %   distance_km (double): Satellite-ground distance (km)
            % Output:
            %   total_loss (double): Total loss (dB)

            fspl = obj.calculate_free_space_path_loss(distance_km);
            atm_loss = obj.calculate_atmospheric_loss();
            rain_loss = obj.calculate_rain_attenuation();

            total_loss = fspl + atm_loss + rain_loss;
        end

        function fspl = calculate_free_space_path_loss(obj, distance_km)
            % Calculates the Free Space Path Loss (FSPL).
            % Formula based on reference [3], Eq. (4.7)
            % Input:
            %   distance_km (double): Satellite-ground distance (km)
            % Output:
            %   fspl (double): Free space path loss (dB)

            fspl = 20 * log10(distance_km) + 20 * log10(obj.frequency_ghz) + 92.45;
        end

        function atm_loss = calculate_atmospheric_loss(obj)
            % Calculates atmospheric loss (simplified ITU-R P.676 model).
            % Based on charts and simplified models in reference [2].
            % Output:
            %   atm_loss (double): Atmospheric loss (dB)

            % Specific attenuation of oxygen and water vapor (dB/km), based on simplified fitted values from ITU charts
            f = obj.frequency_ghz;

            if f < 10
                gamma_o = 0.007;
                gamma_w = 0.002;
            elseif f < 40
                gamma_o = 0.01 + 0.001 * (f - 10);
                gamma_w = 0.005 + 0.004 * (f - 10);
            else
                gamma_o = 0.04;
                gamma_w = 0.08;
            end

            % Equivalent height (km)
            h_o = 6; % Oxygen
            h_w = 2; % Water vapor

            % Path length correction
            path_factor = 1 / sind(obj.elevation_deg);

            % Calculate total loss (dB)
            atm_loss = (gamma_o * h_o + gamma_w * h_w) * path_factor;
        end

        function rain_loss = calculate_rain_attenuation(obj)
            % Calculates rain attenuation (simplified ITU-R P.618 model).
            % Based on the method in reference [1].
            % Output:
            %   rain_loss (double): Rain attenuation (dB)

            % Calculate k and alpha coefficients based on frequency (from ITU-R P.838-3)
            f = obj.frequency_ghz;

            if f < 20
                k = 4.21e-5 * f ^ 2.42;
                alpha = 1.41 * f ^ -0.0779;
            else
                k = 4.09e-2 * f ^ 0.699;
                alpha = 2.63 * f ^ -0.272;
            end

            % Calculate specific attenuation (dB/km)
            specific_attenuation = k * obj.rain_rate_mmh ^ alpha;

            % Calculate effective path length
            h_rain = 3.0; % 0-degree isotherm height (km, simplified value)
            effective_path = (h_rain / sind(obj.elevation_deg));

            % Distance correction factor
            r_factor = 1 / (1 + effective_path / (35 * exp(-0.015 * obj.rain_rate_mmh)));

            rain_loss = specific_attenuation * effective_path * r_factor;
        end

    end

end
