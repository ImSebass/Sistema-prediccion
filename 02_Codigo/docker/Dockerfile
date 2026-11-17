# Imagen reproducible con CUDA + OpenMPI + Python 3.11
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      software-properties-common build-essential gcc libgomp1 openmpi-bin libopenmpi-dev openssh-client \
    && add-apt-repository ppa:deadsnakes/ppa && apt-get update \
    && apt-get install -y python3.11 python3.11-venv python3.11-dev && rm -rf /var/lib/apt/lists/*
RUN python3.11 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN gcc -O3 -march=x86-64-v3 -fopenmp -shared -fPIC src/pronostico/features/kernel_omp.c \
      -o src/pronostico/features/libkernel_omp.so -lm
ENV PYTHONPATH=/app/src
CMD ["bash", "scripts/run_all.sh"]
