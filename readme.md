# SAPIEN Website
## Development Guide
```bash
mkdir mysql
docker-compose build
docker-compose up
# Do the following the first time you initialize the database 
cd db
# install mysql cli
# pip install mysql-connector-python pandas
bash createsql.sh  
# look in backend log for a token, this is the login token for the test user
# go to localhost:4200?token=xxx to log in as the default user
# go to localhost:8088 for backend development. The routes are also proxied from 4200
# frontend and backend should auto-restart with code changes
```

## Deployment Guide
See docker-compose-template.yml. Compared to development, the frontend is
prebuilt and put into a nginx docker, which also forwards requests to the
backend api. The backend and database no longer expose ports, and they are
directly accessible from the docker network in the frontend environment. The
following variables are required:
- DB_PASSWORD: the password for the database
- MYSQL_DIR: the location for mysql data directory
- PORT: the port exposed (outer ngnix layer should forward to this port)
- SAPIEN_STORAGE: the datasets and images of SAPIEN
- JWT_KEY: private key for creating jwt login tokens
- GMAIL_PASSWORD: password token for SMTP sapienaicontact@gmail.com
