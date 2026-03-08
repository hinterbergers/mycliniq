import WidgetKit
import SwiftUI

private let appGroupId = "group.at.mycliniq.shared"
private let snapshotKey = "mycliniq_widget_today_v1"

struct MycliniqNextDay: Decodable {
    let date: String
    let statusLabel: String?
    let workplace: String?
    let dutyLabel: String?
    let isDuty: Bool
}

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
    let nextDays: [MycliniqNextDay]?
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
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 10, to: Date()) ?? Date()
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

struct MycliniqTodayWidgetEntryView: View {
    var entry: MycliniqProvider.Entry

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

struct MycliniqNextDaysWidgetEntryView: View {
    var entry: MycliniqProvider.Entry

    private func formatDay(_ isoDate: String) -> String {
        let parts = isoDate.split(separator: "-")
        if parts.count == 3 {
            let day = parts[2]
            let month = parts[1]
            return "\(day).\(month)."
        }
        return isoDate
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.97, green: 0.98, blue: 1.0), Color.white],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            if let snapshot = entry.snapshot, let nextDays = snapshot.nextDays, !nextDays.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Nächste Tage")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    ForEach(Array(nextDays.prefix(4).enumerated()), id: \.offset) { _, day in
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(formatDay(day.date))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .frame(width: 42, alignment: .leading)

                            Text(day.statusLabel ?? day.workplace ?? "Kein Eintrag")
                                .font(.caption)
                                .lineLimit(1)

                            Spacer(minLength: 0)

                            if day.isDuty {
                                Text(day.dutyLabel ?? "Dienst")
                                    .font(.caption2)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(.red)
                                    .lineLimit(1)
                            }
                        }
                    }
                }
                .padding()
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("mycliniq")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("Keine Vorschau")
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
            MycliniqTodayWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("mycliniq Heute")
        .description("Zeigt den aktuellen Tagesstatus aus dem Dashboard.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct MycliniqNextDaysWidget: Widget {
    let kind: String = "MycliniqNextDaysWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MycliniqProvider()) { entry in
            MycliniqNextDaysWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("mycliniq Nächste Tage")
        .description("Zeigt die nächsten geplanten Tage aus dem Dashboard.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
