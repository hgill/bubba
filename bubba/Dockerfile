FROM mhart/alpine-node:6.2.1

WORKDIR /src

COPY package.json /src/package.json

## Uncomment below line later - this is removed only for superfast caching of node_modules folder
#RUN npm install

CMD if [ "$NODE_ENV" = "development" ]; then npm run devstart ; elif [ "$NODE_ENV" = "production" ]; then npm run start ; fi

#CMD tail -f /src/npm-debug.log