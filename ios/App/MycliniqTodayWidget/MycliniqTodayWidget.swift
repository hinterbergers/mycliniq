import WidgetKit
import SwiftUI

private let appGroupId = "group.at.mycliniq.shared"
private let snapshotKey = "mycliniq_widget_today_v1"

private let brandBlue = Color(red: 0.10, green: 0.39, blue: 0.74)
private let brandBlueLight = Color(red: 0.16, green: 0.47, blue: 0.84)
private let mutedWhite = Color.white.opacity(0.82)
private let cardBlue = Color.white.opacity(0.12)
private let cardBlueBorder = Color.white.opacity(0.20)

struct MycliniqNextDay: Decodable {
    let date: String
    let statusLabel: String?
    let workplace: String?
    let absenceReason: String?
    let dutyLabel: String?
    let isDuty: Bool
    let teammates: [String]?
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
    @Environment(\.widgetFamily) private var family

    private func isCalmStatus(status: String?, absenceReason: String?) -> Bool {
        if let reason = absenceReason, !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return true
        }
        let raw = (status ?? "").lowercased()
        return raw.contains("urlaub") || raw.contains("abwesen")
    }

    private func teammateLine(_ names: [String], maxNames: Int = 2) -> String? {
        let cleaned = names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !cleaned.isEmpty else { return nil }
        if cleaned.count <= maxNames {
            return "Mit: " + cleaned.joined(separator: ", ")
        }
        let visible = cleaned.prefix(maxNames).joined(separator: ", ")
        return "Mit: \(visible) +\(cleaned.count - maxNames)"
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [brandBlue, brandBlueLight],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            if let snapshot = entry.snapshot {
                if family == .systemSmall {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Heute")
                            .font(.caption)
                            .foregroundColor(mutedWhite)

                        Text(snapshot.statusLabel ?? "Kein Eintrag")
                            .font(.title3)
                            .fontWeight(.bold)
                            .foregroundColor(isCalmStatus(status: snapshot.statusLabel, absenceReason: snapshot.absenceReason) ? .green : .white)
                            .lineLimit(3)

                        if snapshot.isDuty, let duty = snapshot.dutyLabel, !duty.isEmpty {
                            Text("Dienst: \(duty)")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.red)
                                .lineLimit(1)
                        }
                    }
                    .padding(14)
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("Heute")
                                .font(.caption)
                                .foregroundColor(mutedWhite)

                            Spacer()

                            if snapshot.isDuty, let duty = snapshot.dutyLabel, !duty.isEmpty {
                                Text(duty)
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Color.red.opacity(0.85))
                                    .clipShape(Capsule())
                            }
                        }

                        Text(snapshot.statusLabel ?? "Kein Eintrag")
                            .font(.title3)
                            .fontWeight(.bold)
                            .foregroundColor(isCalmStatus(status: snapshot.statusLabel, absenceReason: snapshot.absenceReason) ? .green : .white)
                            .lineLimit(2)

                        if let workplace = snapshot.workplace, !workplace.isEmpty {
                            Text(workplace)
                                .font(.caption)
                                .foregroundColor(mutedWhite)
                                .lineLimit(1)
                        }

                        if let teamLine = teammateLine(snapshot.teammates) {
                            Text(teamLine)
                                .font(.caption)
                                .foregroundColor(mutedWhite)
                                .lineLimit(1)
                        }
                    }
                    .padding(14)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("mycliniq")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                    Text("Keine Daten")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("App oeffnen, um zu synchronisieren")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                }
                .padding(14)
            }
        }
    }
}

struct MycliniqNextDaysWidgetEntryView: View {
    var entry: MycliniqProvider.Entry
    @Environment(\.widgetFamily) private var family

    private func isCalmStatus(status: String?, absenceReason: String?) -> Bool {
        if let reason = absenceReason, !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return true
        }
        let raw = (status ?? "").lowercased()
        return raw.contains("urlaub") || raw.contains("abwesen")
    }

    private func teammateLine(_ names: [String], maxNames: Int) -> String? {
        let cleaned = names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !cleaned.isEmpty else { return nil }
        if cleaned.count <= maxNames {
            return "Mit: " + cleaned.joined(separator: ", ")
        }
        let visible = cleaned.prefix(maxNames).joined(separator: ", ")
        return "Mit: \(visible) +\(cleaned.count - maxNames)"
    }

    private func formatDay(_ isoDate: String) -> String {
        let inputFormatter = DateFormatter()
        inputFormatter.calendar = Calendar(identifier: .gregorian)
        inputFormatter.locale = Locale(identifier: "en_US_POSIX")
        inputFormatter.timeZone = TimeZone(secondsFromGMT: 0)
        inputFormatter.dateFormat = "yyyy-MM-dd"

        guard let date = inputFormatter.date(from: isoDate) else {
            return isoDate
        }

        let weekdayFormatter = DateFormatter()
        weekdayFormatter.locale = Locale(identifier: "de_AT")
        weekdayFormatter.dateFormat = "EE"
        let weekday = weekdayFormatter.string(from: date)

        let dayFormatter = DateFormatter()
        dayFormatter.locale = Locale(identifier: "de_AT")
        dayFormatter.dateFormat = "dd.MM."
        let dayLabel = dayFormatter.string(from: date)

        return "\(weekday) \(dayLabel)"
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [brandBlue, brandBlueLight],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            if let snapshot = entry.snapshot, let nextDays = snapshot.nextDays, !nextDays.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    Text("Nächste Tage")
                        .font(.caption)
                        .foregroundColor(mutedWhite)

                    let rowLimit = family == .systemLarge ? 7 : 4
                    let showDetailedTeam = family == .systemLarge

                    ForEach(Array(nextDays.prefix(rowLimit).enumerated()), id: \.offset) { _, day in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(formatDay(day.date))
                                    .font(.caption2)
                                    .foregroundColor(mutedWhite)
                                    .frame(width: 42, alignment: .leading)

                                Text(day.statusLabel ?? day.workplace ?? "Kein Eintrag")
                                    .font(.caption)
                                    .foregroundColor(isCalmStatus(status: day.statusLabel, absenceReason: day.absenceReason) ? .green : .white)
                                    .lineLimit(1)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(cardBlue)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 6)
                                            .stroke(cardBlueBorder, lineWidth: 1)
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: 6))

                                Spacer(minLength: 0)

                                if day.isDuty {
                                    Text(day.dutyLabel ?? "Dienst")
                                        .font(.caption2)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.red)
                                        .lineLimit(1)
                                }
                            }

                            if let teamLine = teammateLine(day.teammates ?? [], maxNames: showDetailedTeam ? 3 : 2) {
                                Text(teamLine)
                                    .font(.caption2)
                                    .foregroundColor(mutedWhite)
                                    .lineLimit(1)
                                    .padding(.leading, 48)
                            }
                        }
                    }
                }
                .padding(14)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("mycliniq")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                    Text("Keine Vorschau")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("App oeffnen, um zu synchronisieren")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                }
                .padding(14)
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
