// iOS print harness: our pages inside a WKWebView, with `window.print()` wired
// the way a given iPhone browser wires it.
//
// Every iPhone browser is WebKit; what differs is the script each app injects
// to replace `window.print()` and what its native side does with the message.
// For the open-source ones that code is public, so this reproduces it exactly
// (sources noted per mode) and lets us run their print path in the iOS
// Simulator, where the App Store versions cannot be installed.
//
//   tools/ios-print-harness/run.sh <mode> <url> [--auto-dismiss <seconds>]
//
// Modes: firefox, duckduckgo, brave, chrome, google-app (broken: no handler).
// The native side logs every step to stdout ("HARNESS ..."), including what
// UIPrintInteractionController reports, which no page can see.

import UIKit
import WebKit

struct Mode {
    let handler: String?
    let shim: String
    let injection: WKUserScriptInjectionTime
    let mainFrameOnly: Bool
}

// window.print replacements, copied from each browser's source.
let modes: [String: Mode] = [
    // mozilla-mobile/firefox-ios: UserScripts/AllFrames/AtDocumentEnd/PrintHandler.js
    "firefox": Mode(
        handler: "printHandler",
        shim: "window.print = function() { webkit.messageHandlers.printHandler.postMessage({}); };",
        injection: .atDocumentEnd, mainFrameOnly: false),
    // duckduckgo/iOS: Core/PrintingUserScript.swift
    "duckduckgo": Mode(
        handler: "printHandler",
        shim: "(function() { window.print = function() { webkit.messageHandlers.printHandler.postMessage({}); }; })();",
        injection: .atDocumentStart, mainFrameOnly: false),
    // brave/brave-core: ios/.../AllFrames/AtDocumentStart/PrintScript.js (security token omitted)
    "brave": Mode(
        handler: "printScriptHandler",
        shim: "window.print = function() { webkit.messageHandlers.printScriptHandler.postMessage({}); };",
        injection: .atDocumentStart, mainFrameOnly: false),
    // chromium: ios/chrome/browser/web/model/print/resources/print.ts
    "chrome": Mode(
        handler: "PrintMessageHandler",
        shim: "window.print = function() { webkit.messageHandlers.PrintMessageHandler.postMessage({}); };",
        injection: .atDocumentStart, mainFrameOnly: false),
    // The Google app (closed source): its stand-in posts to a `print` handler it
    // does not register, so print() throws (seen on a real iPhone, 2026-10-08).
    "google-app": Mode(
        handler: nil,
        shim: "window.print = function() { window.webkit.messageHandlers.print.postMessage({}); };",
        injection: .atDocumentStart, mainFrameOnly: false),
]

func log(_ line: String) {
    print("HARNESS \(String(format: "%.3f", Date().timeIntervalSince1970)) \(line)")
    fflush(stdout)
}

func argument(_ name: String) -> String? {
    let args = ProcessInfo.processInfo.arguments
    guard let index = args.firstIndex(of: name), index + 1 < args.count else { return nil }
    return args[index + 1]
}

final class ViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    var webView: WKWebView!
    let modeName = argument("--mode") ?? "firefox"
    let autoDismiss = argument("--auto-dismiss").flatMap(Double.init)
    var presentCount = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        if let mode = modes[modeName] {
            config.userContentController.addUserScript(
                WKUserScript(source: mode.shim, injectionTime: mode.injection, forMainFrameOnly: mode.mainFrameOnly))
            if let handler = mode.handler {
                config.userContentController.add(self, name: handler)
            }
        } else {
            log("unknown mode \(modeName); window.print left as WebKit's own")
        }
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.isInspectable = true
        view.addSubview(webView)
        let url = URL(string: argument("--url") ?? "http://localhost:3311/")!
        log("mode=\(modeName) url=\(url.absoluteString)")
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        log("page loaded \(webView.url?.absoluteString ?? "")")
    }

    // The native half, as the open-source browsers write it
    // (firefox-ios PrintHelper.swift; the others match in substance).
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        presentCount += 1
        let attempt = presentCount
        let printController = UIPrintInteractionController.shared
        log("print message #\(attempt) from \(message.frameInfo.isMainFrame ? "main frame" : "subframe"); printingAvailable=\(UIPrintInteractionController.isPrintingAvailable)")
        let printInfo = UIPrintInfo(dictionary: nil)
        printInfo.jobName = webView.title ?? "page"
        printInfo.outputType = .general
        printController.printInfo = printInfo
        printController.printFormatter = webView.viewPrintFormatter()
        let presented = printController.present(animated: true) { _, completed, error in
            log("print sheet #\(attempt) closed completed=\(completed) error=\(error.map { "\($0)" } ?? "none")")
        }
        log("present #\(attempt) returned \(presented)")
        if let seconds = autoDismiss, presented {
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
                log("auto-dismissing sheet #\(attempt)")
                printController.dismiss(animated: true)
            }
        }
    }
}

final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = ViewController()
        window?.makeKeyAndVisible()
        return true
    }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
