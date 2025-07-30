# backend/python_backend/services/simulation_service.py

from .matlab_engine_service import matlab_service
import uuid
import redis
import json

class SimulationService:
    """
    Handles business logic related to simulation tasks.
    """
    def __init__(self):
        # Initialize Redis connection
        try:
            self.redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
            self.redis_client.ping() # Check connection
            print("Successfully connected to Redis server.")
        except redis.exceptions.ConnectionError as e:
            print(f"Warning: Could not connect to Redis server: {e}. IQ data will not be cached.")
            self.redis_client = None

    def start_simulation(self, config: dict) -> dict:
        """
        Calls the MATLAB engine to start a new simulation task.
        """
        try:
            simulation_id = f"sim_{uuid.uuid4().hex[:8]}"
            print(f"Received simulation request, ID: {simulation_id}")

            # --- MATLAB Call ---
            matlab_service.start_engine()
            matlab_project_path = 'E:\\Projects\\SatelliateSpectrumSensing\\backend\\matlab'
            matlab_service.eng.addpath(matlab_service.eng.genpath(matlab_project_path))
            
            # --- Call full link simulation ---
            # Construct parameters to pass to MATLAB
            # Pass the entire config as a parameter, as it now contains the full scene snapshot
            sim_params = config
            sim_params['shell'] = 'Shell1' # Temporarily hardcode the shell

            results = matlab_service.eng.interface.api.run_full_link_simulation(sim_params, nargout=1)
            results['simulationId'] = simulation_id

            # --- Store IQ data in Redis ---
            if self.redis_client and results.get('status') == 'success':
                redis_key = results.get('redis_key')
                iq_data = results.get('rx_iq_data')
                if redis_key and iq_data:
                    # Convert IQ data to JSON string for storage
                    self.redis_client.set(redis_key, json.dumps(iq_data), ex=3600) # Cache for 1 hour
                    print(f"IQ data stored in Redis with key: {redis_key}")
                    # Remove the large IQ data from the result returned to the frontend, keeping only the key
                    results.pop('rx_iq_data') 

            print(f"Simulation task {simulation_id} completed.")
            return results

        except Exception as e:
            print(f"A critical error occurred while starting the simulation: {e}")
            raise

# Create a singleton instance of SimulationService
simulation_service = SimulationService()

