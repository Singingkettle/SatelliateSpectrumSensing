# backend/python_backend/services/matlab_engine_service.py

import matlab.engine
import os

class MatlabEngineService:
    """
    封装与MATLAB引擎交互的服务。

    管理引擎的生命周期，包括启动、查找共享会话和关闭。
    提供执行MATLAB函数和脚本的统一接口。
    """
    def __init__(self):
        self.eng = None

    def start_engine(self):
        """
        启动或连接到一个共享的MATLAB引擎会话。

        首先尝试查找现有的共享会话，如果找不到，则启动一个新的异步引擎实例。
        这种方式可以提高效率，避免重复启动MATLAB。
        """
        try:
            # 查找现有的共享MATLAB会话
            existing_sessions = matlab.engine.find_matlab()
            if existing_sessions:
                print(f"找到 {len(existing_sessions)} 个已存在的MATLAB会话，将连接到第一个。")
                self.eng = matlab.engine.connect_matlab(existing_sessions[0])
            else:
                print("未找到共享的MATLAB会話，正在启动新引擎...")
                self.eng = matlab.engine.start_matlab("-nodesktop -nosplash")
            print("MATLAB引擎已成功连接。")
            return self.eng
        except Exception as e:
            print(f"启动或连接MATLAB引擎时发生错误: {e}")
            raise

    def stop_engine(self):
        """
        关闭MATLAB引擎会话。
        """
        if self.eng:
            print("正在关闭MATLAB引擎...")
            self.eng.quit()
            self.eng = None
            print("MATLAB引擎已关闭。")

    def run_matlab_function(self, function_name, *args, **kwargs):
        """
        执行一个MATLAB函数。

        参数:
            function_name (str): 要执行的MATLAB函数的名称。
            *args: 传递给MATLAB函数的位置参数。
            **kwargs: 传递给MATLAB函数的命名参数。

        返回:
            MATLAB函数的执行结果。
        """
        if not self.eng:
            self.start_engine()
        
        try:
            # 获取MATLAB函数句柄
            matlab_func = getattr(self.eng, function_name)
            # 调用函数并返回结果
            result = matlab_func(*args, **kwargs)
            return result
        except Exception as e:
            print(f"执行MATLAB函数 '{function_name}' 时出错: {e}")
            raise

# 创建一个单例服务实例，以便在整个应用中共享
matlab_service = MatlabEngineService()
