import Foundation
import WidgetKit

final class MycliniqWidgetBridge {
  static let shared = MycliniqWidgetBridge()

  private let appGroupId = "group.at.mycliniq.shared"
  private let snapshotKey = "mycliniq_widget_today_v1"

  private init() {}

  func setTodaySnapshot(jsonString: String) {
    guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
    defaults.set(jsonString, forKey: snapshotKey)
    defaults.synchronize()
    WidgetCenter.shared.reloadAllTimelines()
  }
}
