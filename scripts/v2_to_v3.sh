#!/bin/bash

[ -z $1 ] && echo usage: ./v2_to_v3.sh partnet_mobility_dir && exit 1

s1=$(pwd)/mobility_v2_to_v3.py

cd $1

# generate model.gltf and mobility_v3.json
ls . | xargs -I% -P8 bash -c "echo % && python ${s1} -- % > /dev/null 2>/dev/null"
ls . | xargs -I% bash -c "[ ! -f %/model.gltf ] && echo missing %/model.gltf"
ls . | xargs -I% bash -c "[ ! -f %/mobility_v3.json ] && echo missing %/mobility_v3.json"

exit 0
