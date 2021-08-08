(function (app) {
    var usingScreenId = "devices_info";
    var title = "Устройства";
    var targetScreen, leftPanel, infoPanel;
    var devicesListPipe;

    function show(menuItem) {
        targetScreen = app.openScreen(usingScreenId, {
            onCloseScreen: onCloseScreen,
        });
        if (!targetScreen) {
            return;
        }
        app.auth.asyncGetSession(function (session) {
            if (app.getScreenId() == usingScreenId) {
                if (!session.authorized) {
                    return app.showUnathorizedScreen();
                }

                if (session.permissions.mainMenu.indexOf(usingScreenId) !== -1) {
                    targetScreen.el.innerHTML =
                        '<table width="100%" height="100%" cellpadding=0 cellspacing=0><tr valign="top"><td id="leftPanel" class="left-panel" ></td><td id="infoPanel" align="center"></td></tr></table>';
                    leftPanel = app.$("#leftPanel");
                    infoPanel = app.$("#infoPanel");
                    infoPanel.innerHTML = "<h1>" + title + "</h1>";
                    asyncReadDevices();
                }
            }
        });
    }

    function asyncReadDevices() {
        //app.sendJSON('?')
        //app.ws.send(JSON.stringify({path:'n9mp/bindToList',some:'data'}))
        devicesListPipe = app.wsb.createPipe(
            "n9mp",
            "devices",
            {
                sortBy: { asc: ["timeConnected"] },
                rowsPerPage: 10,
                fields: {
                    deviceId: { type: "string", width: "20" },
                    timeConnected: { type: "string", width: "20" },
                    ipAddr: { type: "string", width: "20" },
                },
            },
            devicesListRender,
            devicesListState
        );
    }

    function devicesListRender() {
        console.log();
    }

    function devicesListState() {}

    function onCloseScreen() {
        console.log(usingScreenId + " is closed");
        if (devicesListPipe != undefined) {
            devicesListPipe.close();
        }
        leftPanel = undefined;
    }


    app.addRouteHandler("#devices_info", show);
} ) (app);
