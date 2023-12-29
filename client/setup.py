from setuptools import setup, find_packages

setup(
    name='bomex-client',
    version='0.1.0',
    packages=find_packages(),
    description='Client module for Bomex trading',
    author='Paras',
    author_email='paras.stefanopoulos@outlook.com',
    # Add any other necessary package dependencies here
    install_requires=[
        'websocket-client'
    ],
)
