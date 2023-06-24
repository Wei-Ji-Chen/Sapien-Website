#!/bin/bash

mysql -h127.0.0.1 -uroot -P33060 -pPASSWORD < drop.sql 2>&1 >/dev/null
mysql -h127.0.0.1 -uroot -P33060 -pPASSWORD < init.sql 2>&1 >/dev/null
python3 annotation_import_partnet_mobility.py  --host 127.0.0.1 --port 33060 --user root --password PASSWORD --partnet-dir ../storage/dataset --target-dir ../storage/models/partnet
