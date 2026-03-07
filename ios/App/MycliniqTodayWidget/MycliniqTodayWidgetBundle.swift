//
//  MycliniqTodayWidgetBundle.swift
//  MycliniqTodayWidget
//
//  Created by Stefan Hinterberger on 07.03.26.
//

import WidgetKit
import SwiftUI

@main
struct MycliniqTodayWidgetBundle: WidgetBundle {
    var body: some Widget {
        MycliniqTodayWidget()
        MycliniqNextDaysWidget()
    }
}
