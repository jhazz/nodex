const fs = require("fs");
const WebSocket = require("ws");
const url = require("url");
const path = require("path");
const http = require("http");
const https = require("https");
const ipc = require("../../includes/ipc");
const cookie = require("cookie");

var http_server, https_server, http_wss;
var cache = {};
var home, port, sport, host, docroot;
var routes = {};
var wsHandlers = {};
var isSecured = false;
var isCacheOn;
var lastflowId = 0;
var cookieSessionIdName, cookieSessionBaseUrl, cookieSessionTerm;
const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

var flows = {}; // пул асинхронных запросов к вызываемым обработчиком route
var flowCount = 0;

ipc.manifest({
  cmd: {
    addHTTPRoute: {
      fn: addHTTPRoute,
      note:
        "Добавляет маршрут обработки http(s) пути в URL, при котором main (диспетчер) формирует событие, указанное в параметре emit",
      args: {
        path: {
          type: "string",
          note: "Путь, к которому будет привязан обработчик",
        },
        from: {
          type: "string",
          note: "Имя обработчика. Подставляется диспетчером main",
        },
        emit: {
          type: "string",
          note: "Команда, которая будет вызываться при сработке пути",
        },
      },
    },
    setWsHandler: {
      fn: setWsHandler,
      args: {
        topic: {
          type: "string",
          note: "Путь, к которому будет привязан обработчик команд вебсокета",
        },
        from: {
          type: "string",
          note: "Имя обработчика. Подставляется диспетчером main",
        },
        emit: {
          type: "string",
          note: "Команда, которая будет вызываться при сработке условия",
        },
        // key: {type:'string', note:'Параметр JSON, который будет проверяться'},
        // value:{type:'string', note:'Значение JSON параметра, которое вызовет сработку условия'}
      },
    },
    start: {
      fn: start,
      args: {
        home: {
          type: "string",
          note: "Путь к файловой папке, которая будет корневой",
        },
        port: {
          type: "int",
          note: "Порт http-слушателя",
          default: 8000,
        },
        sport: {
          type: "int",
          note:
            "Порт https-слушателя. Если не указаны сертификаты, порт не будет включен",
          default: 8443,
        },
        host: {
          type: "string",
          note: "Хост на котором будут работать слушатели",
          default: "0.0.0.0",
        },
        docroot: {
          type: "string",
          note:
            "Абсолютный путь к папке с http документами, если путь относительный, то он будет определен относительно папки home",
          default: "root",
        },
        isCacheOn: {
          type: "int",
          note: "Использовать ли кэширование",
          default: 1,
        },
        cookieSessionIdName: {
          type: "string",
          note: "Название куки, которая устанавливает код сессии",
          default: "__session_ID__",
        },
        cookieSessionTerm: {
          type: "int",
          note: "Длительность сессии в секундах",
          default: 2592000,
        },
        cookieSessionBaseUrl: {
          type: "string",
          note: "Абсолютный путь по которому будет устанавливаться кука",
          default: "/",
        },
        key: { type: "string", note: "Ключ для https", optional: 1 },
        cert: {
          type: "string",
          note: "Сертификат для https",
          optional: 1,
        },
        certPath: {
          type: "string",
          note:
            "Абсолютный путь к папке с файлами ключа и сертификата, либо относительный от home",
          optional: 1,
        },
      },
    },
    httpGetPostText: {
      fn: httpGetPostText,
      args: {
        flowId: { type: "string" },
        onpost: {
          type: "string",
          note: "Имя команды обработчика полученных данных или ошибки",
        },
      },
    },
    httpResponse: {
      fn: httpResponse,
      note:
        "Команда доставки частей HTTP ответа от обработчиков подписанных через addHTTPRoute",
      args: {
        flowId: { type: "string" },
        statusCode: { type: "int", default: 200 },
        partial: { type: "int", default: 0 },
      },
    },
  }
})

function httpResponse(args) {
  let flowId = args.flowId;
  let statusCode = args.code ?? 200;
  let partial = args.partial ?? 0;
  console.log(
    `Received response to flowId='${flowId}' and text '${args.text}'`
  );
  let flow = flows["" + flowId];
  if (!flow) {
    console.error(`Received ipc response text for already closed flowId='${flowId}'. Dead text is '${args.text}'`)
    let flow = flows["" + flowId];
  } else {
    let res = flow.res;
    res.statusCode = statusCode;
    res.write(args.text);
    if (!partial) {
      res.end();
      _closeFlow(flowId);
    }
  }
}

function _closeFlow(flowId) {
  let req = flows["" + flowId];
  if (!req) {
    console.error("HTTP flow has already closed! ", flowId);
    return;
  }
  delete flows["" + flowId];
  flowCount--;
  console.log("HTTP flows registry shrinked to count", flowCount);
  // TODO: Надо проверить не остаются ли зависшие соединения в flow.req в случае ошибок. Возможно надо повесить sentinel'a
}

function httpGetPostText(args) {
  let flowId = args.flowId;
  let flow = flows["" + flowId];
  let from = args.from;
  let onpost = args.onpost;

  if (!flow) {
    console.error(
      `Received IPC 'httpGetPostText' for already closed flowId='${flowId}'. Dead text is '${args.text}'`
    );
  } else {
    if (flow.req.method != "POST") {
      console.error(
        `Received IPC 'httpGetPostText' for the flow made by method ${flow.req.method}`
      );
      return;
    }
    if (!!flow.body) {
      console.error("Уже подписался кто-то на httpGetPostText");
      return;
    }
    flow.body = [];
    flow.onRequestEndTarget = from;
    flow.onRequestEndEmit = onpost;

    flow.req.on("data", (chunk) => {
      flow.body.push(chunk);
    });

    flow.req.on("end", () => {
      ipc.sendCommand(flow.onRequestEndTarget, flow.onRequestEndEmit, {
        sessionId: flow.sessionId,
        text: Buffer.concat(flow.body).toString(),
        flowId: flowId,
        url: flow.req.url,
      });
    });

    flow.req.on("error", (err) => {
      ipc.sendCommand(flow.onRequestEndTarget, flow.onRequestEndEmit, {
        sessionId: flow.sessionId,
        text: "-error==" + err,
        error: err,
        flowId: flowId,
        url: flow.req.url,
      });
    });
  }
}

function addHTTPRoute(args) {
  let path = args.path;
  let emit = args.emit;
  let from = args.from;

  console.log(`Adding route to '${path}' that will be served by [${from}]=>${emit}`)
  let routeDefinition = { service: from, emit: emit };
  if (args.useSession) routeDefinition.useSession = 1;
  routes[path] = routeDefinition;
}


/**
 * args.from от какого сервиса пришло ipc сообщение преобразуется в =>{service}
 * args.topic тема, на который идет подписка
 * args.emit какое сообщение надо направить в сервис-подписчик =>{emit}
 * */
function setWsHandler(args) {
  var handlers = wsHandlers[args.from];
  if (!handlers) {
    handlers = wsHandlers[args.from] = [];
  }
  var handler = { service: args.from, emit: args.emit };
  handlers[args.topic] = handler;
  return handler;
}

function _sendRequestBegin(routeDefinition, req, res) {
  let to = routeDefinition.service;
  let cmd = routeDefinition.emit;
  var sessionId;

  lastflowId++;
  flowCount++;
  var flow = { to: to, req: req, res: res, flowId: lastflowId };
  flows[lastflowId] = flow;

  if (routeDefinition.useSession) {
    var receivedCookiesStr = req.headers.cookie, receivedCookies;
    if (!!receivedCookiesStr) {
      receivedCookies = cookie.parse(receivedCookiesStr);
      if (!!receivedCookies[cookieSessionIdName]) {
        sessionId = receivedCookies[cookieSessionIdName];
        flow.sessionId = sessionId;
        ipc.sendCommand("auth", "authorizeHTTPRequest", {
          flowId: lastflowId,
          url: req.url,
          sessionId: sessionId,
          next: { to: to, cmd: cmd },
        });
        return;
      }
    }

    if (!sessionId) {
      flow.sessionId = sessionId = "SES" + Math.random();
    }

    res.setHeader(
      "Set-Cookie",
      cookie.serialize(cookieSessionIdName, sessionId, {
        httpOnly: true,
        path: cookieSessionBaseUrl,
        maxAge: cookieSessionTerm, //60 * 60 * 24 * 30 // 1 month = 2592000 sec
      })
    );
    ipc.sendCommand(to, cmd, {
      flowId: lastflowId,
      sessionId: sessionId,
      url: req.url,
    });
  } else {
    ipc.sendCommand(to, cmd, { flowId: lastflowId, url: req.url });
  }
}

function start(options) {
  ipc.sendStatus("starting")
  home = options.home
  port = options.port
  sport = options.sport
  host = options.host
  docroot = options.docroot
  isCacheOn = options.isCacheOn
  if (!!options.key && !!options.cert) {
    isSecured = true
  }
  cookieSessionIdName = options.cookieSessionIdName
  cookieSessionBaseUrl = options.cookieSessionBaseUrl
  cookieSessionTerm = options.cookieSessionTerm

  if (!path.isAbsolute(docroot)) {
    docroot = path.join(home, docroot)
  }
  console.log("Serving http://" + host + ":" + port + "/  on docroot=",docroot)
  http_server = http.createServer(options, onRequest)
  http_wss = new WebSocket.Server({ server: http_server })
  http_wss.on("connection", function connection(ws) {
    ws.on("message", _wsBroker)
  });

  http_server.listen(port, host, () => {
    console.log("Started http server");
    if (!isSecured) {
      ipc.sendStatus("started");
    }
  });

  if (isSecured) {
    var certPath = options.certPath;
    if (!certPath) {
      certPath = path.join(__dirname, "../..");
    } else {
      if (!path.isAbsolute(certPath)) {
        certPath = path.join(__dirname, "../..", certPath);
      }
    }
    console.log("Read cert from ", path.join(certPath, options.cert));
    options.cert = fs.readFileSync(path.join(certPath, options.cert));
    options.key = fs.readFileSync(path.join(certPath, options.key));
    console.log("Serving https://" + host + ":" + sport + "/");
    https_server = https.createServer(options, onRequest);
    https_wss = new WebSocket.Server({ server: https_server });
    https_wss.on("connection", function connection(ws, req) {
      ws.on("message", _wsBroker);
      ws.on("open", (event) => {
        console.log("Ws received open event");
      });

      ws.send(
        JSON.stringify({
          "sec-websocket-key:": req.headers["sec-websocket-key"],
          "cookie:": req.headers.cookie,
        })
      );
    });
    https_server.listen(sport, host, () => {
      console.log("Started https server");
      ipc.sendStatus("started");
    });
  }
}

function _wsBroker(wsmsg) {
  let jwsmsg;
  try {
    jwsmsg = JSON.parse(wsmsg);
  } catch (e) {
    console.error("[http wsBroker] received wrong WS message : %s", wsmsg);
    return;
  }

  let to = jwsmsg.to;
  if (!to) {
    console.error("[http wsBroker] received  WS message without to : %s",wsmsg);
    return;
  }
  let h = wsHandlers[to];
  if (!h) {
    h = wsHandlers["*"];
  }
  if (!!h) {
    //process.send(JSON.stringify({to:h.service, cmd:h.emit, flowId:lastflowId, url:req.url, args:jwsmsg}))
    ipc.sendCommand(h.service, h.emit, {
      flowId: lastflowId,
      url: req.url,
      jmsg: jwsmsg
    });
    console.log("[http wsBroker] ws message served by %s.%s",h.service,h.emit);
  } else {
    console.log("[http wsBroker] received ws message without handlers: %s",wsmsg);
  }
  console.log("[http wsBroker] received: %s", message);
}

function onRequest(req, res) {
  var u = url.parse(req.url);
  var mimeType, ext;

  console.log("Requested:", u.path);
  var elements = u.path.split("/", 2);
  var p = elements[1];

  if (p in routes) {
    _sendRequestBegin(routes[p], req, res);
    return;
  }
  let safeSuffix = path.normalize(u.path).replace(/^(\.\.[\/\\])+/, "");
  let fileLoc = path.join(docroot, safeSuffix);

  if (isCacheOn && cache[fileLoc] !== undefined) {
    let c = cache[fileLoc];
    console.log("Send cached file", fileLoc);
    res.statusCode = 200;
    res.write(c.data);
    return res.end();
  }

  console.log("Reading path:", fileLoc);
  fs.access(fileLoc, fs.constants.R_OK, (err) => {
    if (err) {
      // Путь не найден
      console.log(err);
      if (err.code == "ENOENT") {
        res.writeHead(404, "Not Found ");
        res.write("404: Not found " + req.url);
      } else {
        res.writeHead(404, "Not Found ");
        res.write("404: Not found " + req.url + " Error:" + err.code);
      }
      return res.end();
    }

    // путь найден
    fs.stat(fileLoc, (err, stats) => {
      if (err) {
        res.writeHead(503, "No access ");
        res.write("503: Metadata not accessible! " + fileLoc);
        return res.end();
      }
      if (stats.isDirectory()) {
        console.log("Path is dir  =====>");
        fileCandidate = path.join(fileLoc, "index.html");
        fs.access(fileCandidate, fs.constants.R_OK, (err) => {
          if (err) {
            res.writeHead(404, "Not Found ");
            res.write("404: Path has no index found! " + fileLoc);
            return res.end();
          }

          fs.stat(fileCandidate, (err, stats) => {
            if (err) {
              res.writeHead(404, "Not Found");
              res.write("404: Index file is not accessible at " + fileLoc);
              return res.end();
            }

            fs.readFile(fileCandidate, (err, data) => {
              if (err) {
                res.writeHead(404, "Not Found");
                res.write("404: Unable to read index file at " + fileLoc);
                return res.end();
              }
              if (isCacheOn) {
                cache[fileLoc] = {
                  mtime: stats.mtime,
                  data: data,
                };
              }
              res.statusCode = 200;
              res.write(data);
              return res.end();
            });
          });
        });
      } else { 
        // если не isDirectory()
        // console.log("Path is file  =====>")
        if (!stats.isFile()) {
          res.writeHead(404, "Not Found");
          res.write("404: Path is not a file at " + fileLoc);
          return res.end();
        }
        //if (!sessionId) {
          //flow.sessionId = sessionId = "SES" + Math.random();
          fs.readFile(fileLoc, function (err, data) {
            if (err) {
              res.writeHead(404, "Not Found");
              res.write("404: File is not readable at " + fileLoc);
              return res.end();
            }
            ext = path.extname(fileLoc);
            mimeType = mimeTypes[ext];
            res.writeHead(200, { "Content-Type": mimeType });
            if (isCacheOn) {
              cache[fileLoc] = { mtime: stats.mtime, data: data };
            }
            return res.end(data);
          })
        //} // if (!sessionId) 
        // ipc.sendCommand(to, cmd, { flowId: lastflowId, url: req.url });
      }  // если не isDirectory()
    })  //fs.stat
  }) //fs.access
}
