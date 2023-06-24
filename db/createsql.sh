#!/bin/bash

echo Initializing Schema...
mysql -h127.0.0.1 -uroot -P33060 -pPASSWORD < init.sql 2>&1 >/dev/null
echo "ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'PASSWORD'" | mysql -h127.0.0.1 -P33060 -uroot -pPASSWORD 2>&1 >/dev/null
python3 import_data.py --host 127.0.0.1 --port 33060 --user root --password PASSWORD --source metadata.csv
python3 annotation_import_categories.py --host 127.0.0.1 --port 33060 --user root --password PASSWORD
