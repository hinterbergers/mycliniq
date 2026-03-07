import SwiftUI
import WidgetKit

private let appGroupId = "group.at.mycliniq.shared"
private let snapshotKey = "mycliniq_widget_today_v1"

struct MycliniqSnapshot: Decodable {
  let version: Int
  let generatedAt: String
  let date: String?
  let personName: String?
  let statusLabel: String?
  let workplace: String?
  let absenceReason: String?
  let dutyLabel: String?
  let isDuty: Bool
  let teammates: [String]
}

struct MycliniqEntry: TimelineEntry {
  let date: Date
  let snapshot: MycliniqSnapshot?
}

struct MycliniqProvider: TimelineProvider {
  func placeholder(in context: Context) -> MycliniqEntry {
    MycliniqEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (MycliniqEntry) -> Void) {
    completion(MycliniqEntry(date: Date(), snapshot: loadSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MycliniqEntry>) -> Void) {
    let entry = MycliniqEntry(date: Date(), snapshot: loadSnapshot())
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }

  private func loadSnapshot() -> MycliniqSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: snapshotKey),
          let data = json.data(using: .utf8) else {
      return nil
    }
    return try? JSONDecoder().decode(MycliniqSnapshot.self, from: data)
  }
}

struct MycliniqTodayWidgetView: View {
  let entry: MycliniqProvider.Entry

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color(red: 0.97, green: 0.98, blue: 1.0), Color.white],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )

      if let snapshot = entry.snapshot {
        VStack(alignment: .leading, spacing: 6) {
          Text("Heute")
            .font(.caption2)
            .foregroundStyle(.secondary)

          Text(snapshot.statusLabel ?? "Kein Eintrag")
            .font(.headline)
            .lineLimit(2)

          if let workplace = snapshot.workplace, !workplace.isEmpty {
            Text(workplace)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }

          if snapshot.isDuty, let duty = snapshot.dutyLabel, !duty.isEmpty {
            Text("Dienst: \(duty)")
              .font(.caption2)
              .fontWeight(.semibold)
              .foregroundStyle(.red)
              .lineLimit(1)
          }
        }
        .padding()
      } else {
        VStack(alignment: .leading, spacing: 6) {
          Text("mycliniq")
            .font(.caption2)
            .foregroundStyle(.secondary)
          Text("Keine Daten")
            .font(.headline)
          Text("App oeffnen, um zu synchronisieren")
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .padding()
      }
    }
  }
}

struct MycliniqTodayWidget: Widget {
  let kind: String = "MycliniqTodayWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MycliniqProvider()) { entry in
      MycliniqTodayWidgetView(entry: entry)
    }
    .configurationDisplayName("mycliniq Heute")
    .description("Zeigt den aktuellen Tagesstatus aus dem Dashboard.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
