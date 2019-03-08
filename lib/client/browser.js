// Export istanbul-lib-coverage to be bundled with webpack for browser usage
var istanbulLibCoverage = require('istanbul-lib-coverage');

(function(window) {

  var karma = window.__karma__;

  karma.start = function() {

    var config = karma.config && karma.config.ui5 || {};

    if (karma.config.clearContext) {
      // TODO: remove? plugin already makes sure to configure clearContext=false
      karma.log("error", ["karma-ui5 requires 'clearContext: false'"]);
      return;
    }

    var prependBase = path => /^\/base\//.test(path) ? path : `/base/${path}`;

    var windowUtil = function(url, onload) {
      var context = {
        close: function() {
          if (config.useIframe) {
            document.body.removeChild(context._frame);
          } else {
            context._window.close();
          }
        }
      };

      if (config.useIframe) {
        context._frame = document.createElement("iframe");
        context._frame.onload = function() {
          onload.call(null, context);
        };
        context._frame.setAttribute("style", "height: 1024px; width: 1280px;");
        context._frame.src = url;
        document.body.appendChild(context._frame);
        context.contentWindow = context._frame.contentWindow;
      } else {
        context._window = window.open(url);
        context.contentWindow = context._window;
        context._window.addEventListener("load", function() {
          onload.call(null, context);
        });
      }
      karma.setupContext(context.contentWindow);
    };

    if (!config.testrunner) {
      throw new Error("No testrunner URL configured");
    }

    if (config.testrunner) {

      if (!config.testpage) {
        for (var path in karma.files) {
          if (karma.files.hasOwnProperty(path) && path.endsWith(".qunit.html") && path.includes("/testsuite.")) {
            config.testpage = path;
          }
        }
      }
      if (!config.testpage) {
        throw new Error("Could not find a testsuite!");
      }

      config.testrunner = prependBase(config.testrunner);
      config.testpage = prependBase(config.testpage);

      windowUtil(config.testrunner, function(testRunner) {
        if (window.top) {
          top.jsUnitTestSuite = testRunner.contentWindow.jsUnitTestSuite;
        } else {
          window.jsUnitTestSuite = testRunner.contentWindow.jsUnitTestSuite;
        }

        testRunner.contentWindow.sap.ui.qunit.TestRunner.checkTestPage(config.testpage).then(function(testpages) {
          testRunner.close();
          runTests(testpages);
        }, function(e) {
          console.error("fail");
          console.error(e);
          // TODO: report error
        });
      });

    } else {

    }

    function runTests(testpages) {

      var totalNumberOfTest = 0;
      var coverageMap;

      function mergeCoverage(coverage) {
        if (!coverage) {
          return;
        }
        if (!coverageMap) {
          coverageMap = istanbulLibCoverage.createCoverageMap();
        }
        coverageMap.merge(coverage);
      }

      function runTestPage(i) {

        if (i >= testpages.length) {
          karma.complete({
            coverage: coverageMap ? coverageMap.toJSON() : undefined
          });
          return;
        }

        var qunitHtmlFile = testpages[i];
        windowUtil(qunitHtmlFile, function(testWindow) {
          var QUnit = testWindow.contentWindow.QUnit;
          var timer = null;
          var testResult = {};

          if (QUnit.begin) {
            QUnit.begin(function(args) {
              totalNumberOfTest += args.totalTests;
              karma.info({ total: totalNumberOfTest });
            });
          }

          QUnit.done(function() {
            // Test page done - cleanup and run next page
            if (testWindow) {
              mergeCoverage(testWindow.contentWindow.__coverage__);
              testWindow.close();
              testWindow = null;
              runTestPage(i + 1);
            }
          });

          QUnit.testStart(function (test) {
            timer = new Date().getTime();
            testResult = { success: true, errors: [] };
          });

          QUnit.log(function(details) {
            if (!details.result) {
              var msg = ''

              if (details.message) {
                msg += details.message + '\n'
              }

              if (typeof details.expected !== 'undefined') {
                msg += 'Expected: ' + QUnit.dump.parse(details.expected) + '\n' + 'Actual: ' + QUnit.dump.parse(details.actual) + '\n'
              }

              if (details.source) {
                msg += details.source + '\n'
              }

              testResult.success = false
              testResult.errors.push(msg)
            }
          });

          QUnit.testDone(function(test) {
            var result = {
              description: test.name,
              suite: test.module && [qunitHtmlFile, test.module] || [],
              success: testResult.success,
              log: testResult.errors || [],
              time: new Date().getTime() - timer
            }

            karma.result(result);
          });

        });
      }

      runTestPage(0);

    }

  };

})(typeof window !== 'undefined' ? window : global);