# backend/python_backend/services/matlab_engine_service.py

import matlab.engine
import os

class MatlabEngineService:
    """
    A service that encapsulates interaction with the MATLAB engine.

    Manages the lifecycle of the engine, including starting, finding shared sessions, and shutting down.
    Provides a unified interface for executing MATLAB functions and scripts.
    """
    def __init__(self):
        self.eng = None

    def start_engine(self):
        """
        Starts or connects to a shared MATLAB engine session.

        First, it tries to find existing shared sessions. If none are found, it starts a new asynchronous engine instance.
        This approach improves efficiency by avoiding repeated MATLAB startups.
        """
        try:
            # Find existing shared MATLAB sessions
            existing_sessions = matlab.engine.find_matlab()
            if existing_sessions:
                print(f"Found {len(existing_sessions)} existing MATLAB sessions, connecting to the first one.")
                self.eng = matlab.engine.connect_matlab(existing_sessions[0])
            else:
                print("No shared MATLAB session found, starting a new engine...")
                self.eng = matlab.engine.start_matlab("-nodesktop -nosplash")
            print("MATLAB engine connected successfully.")
            return self.eng
        except Exception as e:
            print(f"An error occurred while starting or connecting to the MATLAB engine: {e}")
            raise

    def stop_engine(self):
        """
        Shuts down the MATLAB engine session.
        """
        if self.eng:
            print("Shutting down MATLAB engine...")
            self.eng.quit()
            self.eng = None
            print("MATLAB engine has been shut down.")

    def run_matlab_function(self, function_name, *args, **kwargs):
        """
        Executes a MATLAB function.

        Args:
            function_name (str): The name of the MATLAB function to execute.
            *args: Positional arguments to pass to the MATLAB function.
            **kwargs: Named arguments to pass to the MATLAB function.

        Returns:
            The execution result of the MATLAB function.
        """
        if not self.eng:
            self.start_engine()
        
        try:
            # Get the MATLAB function handle
            matlab_func = getattr(self.eng, function_name)
            # Call the function and return the result
            result = matlab_func(*args, **kwargs)
            return result
        except Exception as e:
            print(f"An error occurred while executing MATLAB function '{function_name}': {e}")
            raise

# Create a singleton service instance to be shared across the application
matlab_service = MatlabEngineService()
