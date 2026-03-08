import Foundation
import Capacitor

@objc(BridgeViewController)
public class BridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(MycliniqWidgetBridge())
    }
}
