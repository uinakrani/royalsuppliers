1:HL["/_next/static/css/fc0b34830ae53c73.css","style",{"crossOrigin":""}]
2:HL["/_next/static/css/42ab510b0d704f59.css","style",{"crossOrigin":""}]
0:["Iagq-gRr1A0rAXFr13r1J",[[["",{"children":["admin",{"children":["__PAGE__",{}]}]},"$undefined","$undefined",true],"$L3",[[["$","link","0",{"rel":"stylesheet","href":"/_next/static/css/fc0b34830ae53c73.css","precedence":"next","crossOrigin":""}],["$","link","1",{"rel":"stylesheet","href":"/_next/static/css/42ab510b0d704f59.css","precedence":"next","crossOrigin":""}]],"$L4"]]]]
7:I[78439,["923","static/chunks/923-9d08f09f96c35d8c.js","185","static/chunks/app/layout-a290843aafe9ac3c.js"],"PopupStackProvider"]
8:I[19148,["923","static/chunks/923-9d08f09f96c35d8c.js","185","static/chunks/app/layout-a290843aafe9ac3c.js"],""]
9:I[88923,["923","static/chunks/923-9d08f09f96c35d8c.js","185","static/chunks/app/layout-a290843aafe9ac3c.js"],""]
a:I[19958,["923","static/chunks/923-9d08f09f96c35d8c.js","185","static/chunks/app/layout-a290843aafe9ac3c.js"],""]
b:I[43220,["923","static/chunks/923-9d08f09f96c35d8c.js","185","static/chunks/app/layout-a290843aafe9ac3c.js"],""]
c:I[29628,["923","static/chunks/923-9d08f09f96c35d8c.js","185","static/chunks/app/layout-a290843aafe9ac3c.js"],""]
d:I[53465,["923","static/chunks/923-9d08f09f96c35d8c.js","185","static/chunks/app/layout-a290843aafe9ac3c.js"],""]
e:I[14170,["923","static/chunks/923-9d08f09f96c35d8c.js","185","static/chunks/app/layout-a290843aafe9ac3c.js"],""]
f:I[86345,["923","static/chunks/923-9d08f09f96c35d8c.js","185","static/chunks/app/layout-a290843aafe9ac3c.js"],""]
10:I[56954,[],""]
11:I[7264,[],""]
13:I[48297,[],""]
14:I[35184,["358","static/chunks/bc9e92e6-23a4861a6c29e4e6.js","118","static/chunks/118-eebe7c7bc4050be3.js","923","static/chunks/923-9d08f09f96c35d8c.js","295","static/chunks/295-2d252011530962a0.js","3","static/chunks/app/admin/page-6d12a663cde8ba14.js"],""]
5:Ta6f,
          /* iOS Status Bar Color - Match header color (#2e31fb) */
          @supports (-webkit-touch-callout: none) {
            html {
              background-color: #2e31fb !important;
            }
            body {
              background-color: #f9fafb;
              /* Blue background at top for status bar area */
              background: linear-gradient(to bottom, #2e31fb 0%, #2e31fb env(safe-area-inset-top, 44px), #f9fafb env(safe-area-inset-top, 44px)) !important;
            }
            /* Ensure header background matches status bar */
            .bg-primary-600 {
              background-color: #2e31fb !important;
            }
            /* Make status bar area blue - extend header color to top */
            #__next {
              background: linear-gradient(to bottom, #2e31fb 0%, #2e31fb env(safe-area-inset-top, 0px), transparent env(safe-area-inset-top, 0px));
            }
            /* Ensure status bar area is blue in standalone mode */
            html.standalone {
              background-color: #2e31fb !important;
            }
            html.standalone body {
              background: linear-gradient(to bottom, #2e31fb 0%, #2e31fb env(safe-area-inset-top, 44px), #f9fafb env(safe-area-inset-top, 44px)) !important;
            }
            html.standalone #__next::before {
              content: '';
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              height: env(safe-area-inset-top, 44px);
              background-color: #2e31fb !important;
              z-index: 9999;
              pointer-events: none;
            }
          }
          /* Android status bar color */
          @media (prefers-color-scheme: dark) {
            html {
              background-color: #2e31fb;
            }
          }
          @media (prefers-color-scheme: light) {
            html {
              background-color: #2e31fb;
            }
          }
          /* Hide browser UI on Android */
          html.android body {
            /* Force full viewport height */
            height: 100vh;
            height: 100dvh;
            overflow: hidden;
          }
          html.android #__next {
            height: 100vh;
            height: 100dvh;
            overflow: auto;
            -webkit-overflow-scrolling: touch;
          }
          /* Hide address bar and browser chrome on Android */
          @media screen and (display-mode: standalone) {
            html.android {
              /* Ensure fullscreen on Android */
              position: fixed;
              width: 100%;
              height: 100%;
            }
          }
        6:T7a5,
              // Detect if app is in standalone mode (PWA) and add class to html
              (function() {
                const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                    window.matchMedia('(display-mode: fullscreen)').matches ||
                    (window.navigator.standalone === true) ||
                    document.referrer.includes('android-app://');
                
                if (isStandalone) {
                  document.documentElement.classList.add('standalone');
                }
                
                // Detect Android
                const isAndroid = /Android/i.test(navigator.userAgent);
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                
                if (isAndroid) {
                  document.documentElement.classList.add('android');
                }
                if (isIOS) {
                  document.documentElement.classList.add('ios');
                }
                
                // Request fullscreen for Android when in standalone/fullscreen mode
                if (isAndroid && isStandalone) {
                  // Try to enter fullscreen after a short delay
                  setTimeout(function() {
                    const doc = document.documentElement;
                    if (doc.requestFullscreen) {
                      doc.requestFullscreen().catch(function() {
                        // Fullscreen might require user gesture
                      });
                    } else if (doc.webkitRequestFullscreen) {
                      doc.webkitRequestFullscreen();
                    } else if (doc.mozRequestFullScreen) {
                      doc.mozRequestFullScreen();
                    } else if (doc.msRequestFullscreen) {
                      doc.msRequestFullscreen();
                    }
                  }, 500);
                }
              })();
            3:[null,["$","html",null,{"lang":"en","children":[["$","head",null,{"children":[["$","meta",null,{"name":"viewport","content":"width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover"}],["$","link",null,{"rel":"icon","href":"/favicon.ico"}],["$","link",null,{"rel":"apple-touch-icon","href":"/icon-192x192.png"}],["$","link",null,{"rel":"apple-touch-icon","sizes":"192x192","href":"/icon-192x192.png"}],["$","link",null,{"rel":"apple-touch-icon","sizes":"512x512","href":"/icon-512x512.png"}],["$","meta",null,{"name":"apple-mobile-web-app-capable","content":"yes"}],["$","meta",null,{"name":"apple-mobile-web-app-status-bar-style","content":"black-translucent"}],["$","meta",null,{"name":"theme-color","content":"#2e31fb"}],["$","meta",null,{"name":"theme-color","content":"#2e31fb","media":"(prefers-color-scheme: light)"}],["$","meta",null,{"name":"theme-color","content":"#2e31fb","media":"(prefers-color-scheme: dark)"}],["$","meta",null,{"name":"apple-mobile-web-app-title","content":"Royal Suppliers"}],["$","style",null,{"dangerouslySetInnerHTML":{"__html":"$5"}}],["$","meta",null,{"name":"mobile-web-app-capable","content":"yes"}],["$","meta",null,{"name":"format-detection","content":"telephone=no"}],["$","meta",null,{"name":"apple-touch-fullscreen","content":"yes"}],["$","meta",null,{"name":"application-name","content":"Royal Suppliers"}],["$","meta",null,{"name":"msapplication-TileColor","content":"#2e31fb"}],["$","meta",null,{"name":"msapplication-tap-highlight","content":"no"}]]}],["$","body",null,{"className":"__className_b9c7ce bg-gray-50","children":[["$","script",null,{"dangerouslySetInnerHTML":{"__html":"$6"}}],["$","$L7",null,{"children":[["$","$L8",null,{}],["$","$L9",null,{}],["$","$La",null,{}],["$","$Lb",null,{}],["$","$Lc",null,{}],["$","$Ld",null,{}],["$","$Le",null,{}],["$","$Lf",null,{}],["$","$L10",null,{"parallelRouterKey":"children","segmentPath":["children"],"loading":"$undefined","loadingStyles":"$undefined","hasLoading":false,"error":"$undefined","errorStyles":"$undefined","template":["$","$L11",null,{}],"templateStyles":"$undefined","notFound":[["$","title",null,{"children":"404: This page could not be found."}],["$","div",null,{"style":{"fontFamily":"system-ui,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif,\"Apple Color Emoji\",\"Segoe UI Emoji\"","height":"100vh","textAlign":"center","display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center"},"children":["$","div",null,{"children":[["$","style",null,{"dangerouslySetInnerHTML":{"__html":"body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}"}}],["$","h1",null,{"className":"next-error-h1","style":{"display":"inline-block","margin":"0 20px 0 0","padding":"0 23px 0 0","fontSize":24,"fontWeight":500,"verticalAlign":"top","lineHeight":"49px"},"children":"404"}],["$","div",null,{"style":{"display":"inline-block"},"children":["$","h2",null,{"style":{"fontSize":14,"fontWeight":400,"lineHeight":"49px","margin":0},"children":"This page could not be found."}]}]]}]}]],"notFoundStyles":[],"childProp":{"current":["$","$L10",null,{"parallelRouterKey":"children","segmentPath":["children","admin","children"],"loading":"$undefined","loadingStyles":"$undefined","hasLoading":false,"error":"$undefined","errorStyles":"$undefined","template":["$","$L11",null,{}],"templateStyles":"$undefined","notFound":"$undefined","notFoundStyles":"$undefined","childProp":{"current":["$L12",["$","$L13",null,{"propsForComponent":{"params":{}},"Component":"$14","isStaticGeneration":true}],null],"segment":"__PAGE__"},"styles":[]}],"segment":"admin"},"styles":[]}]]}]]}]]}],null]
4:[["$","meta","0",{"charSet":"utf-8"}],["$","title","1",{"children":"Royal Suppliers - Order Management"}],["$","meta","2",{"name":"description","content":"Order and invoice management system"}],["$","link","3",{"rel":"manifest","href":"/manifest.json"}],["$","meta","4",{"name":"theme-color","content":"#2e31fb"}],["$","meta","5",{"name":"viewport","content":"width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover, user-scalable=yes"}],["$","meta","6",{"name":"mobile-web-app-capable","content":"yes"}],["$","meta","7",{"name":"apple-mobile-web-app-capable","content":"yes"}],["$","meta","8",{"name":"apple-mobile-web-app-status-bar-style","content":"default"}],["$","meta","9",{"name":"apple-mobile-web-app-title","content":"Royal Suppliers"}],["$","meta","10",{"name":"apple-mobile-web-app-capable","content":"yes"}],["$","meta","11",{"name":"apple-mobile-web-app-title","content":"Royal Suppliers"}],["$","meta","12",{"name":"apple-mobile-web-app-status-bar-style","content":"default"}]]
12:null
