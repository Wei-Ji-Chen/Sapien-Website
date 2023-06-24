FROM ubuntu:20.04

RUN apt update && apt install -y wget curl libxxf86vm1 libgl1 libxi6 libxrender1
RUN curl -fsSL https://deb.nodesource.com/setup_14.x | bash -
RUN apt install -y nodejs

WORKDIR /root
RUN wget http://storage1.ucsd.edu/datasets/software/blender-3.0.1-linux-x64.tar.xz && \
    tar -xf blender-3.0.1-linux-x64.tar.xz && \
    rm -rf blender-3.0.1-linux-x64.tar.xz
ENV PATH=/root/blender-3.0.1-linux-x64:${PATH}
RUN apt install -y assimp-utils

COPY . /site

WORKDIR /site
RUN npm i && npm run build

VOLUME /storage

WORKDIR /site/server-dist

HEALTHCHECK CMD curl --fail http://localhost:8088/api || exit 1

CMD ["node", "index.js"]
