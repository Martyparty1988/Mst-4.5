import React, { useState, useEffect } from 'react';
import { FileText, Download, Calendar, TrendingUp, Users, Wrench, AlertCircle, CheckCircle } from 'lucide-react';
import { db } from '../db';
import { DailyReport, UserProfile, TableStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface DailyReportsProps {
    currentUser: UserProfile;
}

export default function DailyReports({ currentUser }: DailyReportsProps) {
    const [reports, setReports] = useState<DailyReport[]>([]);
    const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        const allReports = await db.dailyReports.orderBy('date').reverse().limit(30).toArray();
        setReports(allReports);
    };

    const generateDailyReport = async () => {
        setIsGenerating(true);
        const today = new Date().toISOString().split('T')[0];

        // Check if report for today already exists
        const existingReport = await db.dailyReports.where('date').equals(today).first();
        if (existingReport) {
            alert('Report pro dnešní den již existuje!');
            setIsGenerating(false);
            return;
        }

        try {
            // Gather project stats
            const projects = await db.projects.toArray();
            const projectStats = await Promise.all(
                projects.map(async (project) => {
                    const allTables = await db.projectTables.where('projectId').equals(project.id).toArray();
                    const completedTables = allTables.filter(t => t.status === TableStatus.Completed);
                    const issueTables = allTables.filter(t => t.status === TableStatus.Issue);

                    // Count tables completed today
                    const todayStart = new Date(today).setHours(0, 0, 0, 0);
                    const todayEnd = new Date(today).setHours(23, 59, 59, 999);
                    const completedToday = completedTables.filter(
                        t => t.completedAt && t.completedAt >= todayStart && t.completedAt <= todayEnd
                    ).length;

                    // Count active workers on this project
                    const assignedWorkers = project.assignedEmployees?.length || 0;

                    return {
                        projectId: project.id,
                        projectName: project.name,
                        tablesCompleted: completedToday,
                        tablesTotal: allTables.length,
                        completionPercentage: allTables.length > 0 ? Math.round((completedTables.length / allTables.length) * 100) : 0,
                        issuesCount: issueTables.length,
                        activeWorkers: assignedWorkers
                    };
                })
            );

            // Gather team stats
            const todayAttendance = await db.attendance.where('date').equals(today).toArray();
            const totalWorkersPresent = todayAttendance.length;

            // Calculate hours worked
            const totalHoursWorked = todayAttendance.reduce((sum, record) => {
                if (record.checkOut && record.checkIn) {
                    const hours = (record.checkOut - record.checkIn) / (1000 * 60 * 60);
                    return sum + hours;
                }
                return sum;
            }, 0);

            // Find top performers (most tables completed today)
            const todayStart = new Date(today).setHours(0, 0, 0, 0);
            const todayEnd = new Date(today).setHours(23, 59, 59, 999);
            const todayCompletions = await db.projectTables
                .filter(t => t.completedAt && t.completedAt >= todayStart && t.completedAt <= todayEnd && !!t.completedBy)
                .toArray();

            const performerMap = new Map<string, number>();
            for (const table of todayCompletions) {
                if (table.completedBy) {
                    performerMap.set(table.completedBy, (performerMap.get(table.completedBy) || 0) + 1);
                }
            }

            const topPerformersData = await Promise.all(
                Array.from(performerMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(async ([memberId, count]) => {
                        const member = await db.team.get(memberId);
                        return {
                            memberId,
                            memberName: member?.name || 'Neznámý',
                            tablesCompleted: count
                        };
                    })
            );

            // Gather tools stats
            const allTools = await db.tools.toArray();
            const borrowedTools = allTools.filter(t => t.status === 'Borrowed').length;
            const availableTools = allTools.filter(t => t.status === 'Available').length;
            const brokenTools = allTools.filter(t => t.status === 'Broken' || t.status === 'Service').length;

            // Generate summary
            const totalCompleted = projectStats.reduce((sum, p) => sum + p.tablesCompleted, 0);
            const totalIssues = projectStats.reduce((sum, p) => sum + p.issuesCount, 0);

            let summary = `Denní report pro ${new Date(today).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}.\n\n`;
            summary += `📊 Celkem dokončeno ${totalCompleted} trackerů.\n`;
            summary += `👥 Přítomno ${totalWorkersPresent} pracovníků (celkem ${totalHoursWorked.toFixed(1)} hodin).\n`;
            if (totalIssues > 0) {
                summary += `⚠️ Hlášeno ${totalIssues} problémů.\n`;
            }
            if (topPerformersData.length > 0) {
                summary += `🏆 Nejlepší výkon: ${topPerformersData[0].memberName} (${topPerformersData[0].tablesCompleted} trackerů).\n`;
            }
            summary += `🔧 Nářadí: ${borrowedTools} vypůjčeno, ${availableTools} dostupných.`;

            const report: DailyReport = {
                id: uuidv4(),
                date: today,
                generatedAt: Date.now(),
                projectStats,
                teamStats: {
                    totalHoursWorked,
                    totalWorkersPresent,
                    topPerformers: topPerformersData
                },
                toolsStats: {
                    totalBorrowed: borrowedTools,
                    totalAvailable: availableTools,
                    issuesReported: brokenTools
                },
                summary
            };

            await db.dailyReports.add(report);
            await loadReports();
            setSelectedReport(report);

            // Log the action
            await db.logs.add({
                action: 'DAILY_REPORT_GENERATED',
                details: `Report for ${today}`,
                timestamp: Date.now(),
                user: currentUser.name
            });
        } catch (error) {
            console.error('Error generating report:', error);
            alert('Chyba při generování reportu!');
        } finally {
            setIsGenerating(false);
        }
    };

    const downloadReport = (report: DailyReport) => {
        const content = `
===========================================
DENNÍ REPORT - MST
===========================================
Datum: ${new Date(report.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
Vygenerováno: ${new Date(report.generatedAt).toLocaleString('cs-CZ')}

${report.summary}

-------------------------------------------
PROJEKTY
-------------------------------------------
${report.projectStats.map(p => `
${p.projectName}
  - Dokončeno dnes: ${p.tablesCompleted} trackerů
  - Celkový pokrok: ${p.completionPercentage}% (${p.tablesTotal} celkem)
  - Problémy: ${p.issuesCount}
  - Aktivní pracovníci: ${p.activeWorkers}
`).join('\n')}

-------------------------------------------
TÝM
-------------------------------------------
Celkem přítomno: ${report.teamStats.totalWorkersPresent} pracovníků
Odpracováno hodin: ${report.teamStats.totalHoursWorked.toFixed(1)} h

TOP VÝKONY:
${report.teamStats.topPerformers.map((p, i) => `${i + 1}. ${p.memberName} - ${p.tablesCompleted} trackerů`).join('\n')}

-------------------------------------------
NÁŘADÍ
-------------------------------------------
Vypůjčeno: ${report.toolsStats.totalBorrowed}
Dostupné: ${report.toolsStats.totalAvailable}
Problémy: ${report.toolsStats.issuesReported}

===========================================
    `.trim();

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MST_Report_${report.date}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FileText className="text-blue-600" size={24} />
                    <h2 className="text-xl font-bold text-slate-800">Denní Reporty</h2>
                </div>
                <button
                    onClick={generateDailyReport}
                    disabled={isGenerating}
                    className="glass-button bg-gradient-to-br from-blue-500 to-blue-600 text-white px-4 py-2 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                    {isGenerating ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                            Generuji...
                        </>
                    ) : (
                        <>
                            <FileText size={16} />
                            Vygenerovat dnes
                        </>
                    )}
                </button>
            </div>

            {/* Reports List */}
            <div className="space-y-3">
                {reports.length === 0 ? (
                    <div className="glass-panel p-8 text-center">
                        <FileText size={48} className="mx-auto mb-3 text-slate-300" />
                        <p className="text-slate-500 font-medium">Zatím žádné reporty</p>
                        <p className="text-sm text-slate-400 mt-1">Klikněte na "Vygenerovat dnes" pro vytvoření prvního reportu</p>
                    </div>
                ) : (
                    reports.map((report) => (
                        <div
                            key={report.id}
                            className="glass-panel p-4 cursor-pointer hover:scale-[1.02] transition-all"
                            onClick={() => setSelectedReport(selectedReport?.id === report.id ? null : report)}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Calendar size={18} className="text-blue-600" />
                                    <h3 className="font-bold text-slate-800">
                                        {new Date(report.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </h3>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        downloadReport(report);
                                    }}
                                    className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                                >
                                    <Download size={16} className="text-slate-600" />
                                </button>
                            </div>

                            {/* Quick Stats */}
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                <div className="bg-white/50 rounded-lg p-2 text-center">
                                    <TrendingUp size={16} className="mx-auto mb-1 text-green-600" />
                                    <p className="text-xs text-slate-500">Dokončeno</p>
                                    <p className="font-bold text-slate-800">
                                        {report.projectStats.reduce((sum, p) => sum + p.tablesCompleted, 0)}
                                    </p>
                                </div>
                                <div className="bg-white/50 rounded-lg p-2 text-center">
                                    <Users size={16} className="mx-auto mb-1 text-blue-600" />
                                    <p className="text-xs text-slate-500">Pracovníků</p>
                                    <p className="font-bold text-slate-800">{report.teamStats.totalWorkersPresent}</p>
                                </div>
                                <div className="bg-white/50 rounded-lg p-2 text-center">
                                    <Wrench size={16} className="mx-auto mb-1 text-orange-600" />
                                    <p className="text-xs text-slate-500">Nářadí</p>
                                    <p className="font-bold text-slate-800">{report.toolsStats.totalBorrowed}</p>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {selectedReport?.id === report.id && (
                                <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                                    {/* Summary */}
                                    <div className="bg-blue-50 rounded-lg p-3">
                                        <p className="text-sm text-slate-700 whitespace-pre-line">{report.summary}</p>
                                    </div>

                                    {/* Project Details */}
                                    <div>
                                        <h4 className="font-bold text-sm text-slate-700 mb-2 flex items-center gap-2">
                                            <TrendingUp size={14} />
                                            Projekty
                                        </h4>
                                        <div className="space-y-2">
                                            {report.projectStats.map((proj) => (
                                                <div key={proj.projectId} className="bg-white/70 rounded-lg p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-medium text-sm text-slate-800">{proj.projectName}</span>
                                                        <span className="text-xs font-bold text-blue-600">{proj.completionPercentage}%</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                                                        <div className="flex items-center gap-1">
                                                            <CheckCircle size={12} className="text-green-600" />
                                                            Dnes: {proj.tablesCompleted}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Users size={12} className="text-blue-600" />
                                                            Tým: {proj.activeWorkers}
                                                        </div>
                                                        {proj.issuesCount > 0 && (
                                                            <div className="flex items-center gap-1 col-span-2">
                                                                <AlertCircle size={12} className="text-red-600" />
                                                                Problémy: {proj.issuesCount}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Top Performers */}
                                    {report.teamStats.topPerformers.length > 0 && (
                                        <div>
                                            <h4 className="font-bold text-sm text-slate-700 mb-2 flex items-center gap-2">
                                                🏆 Top Výkony
                                            </h4>
                                            <div className="space-y-1">
                                                {report.teamStats.topPerformers.map((performer, index) => (
                                                    <div key={performer.memberId} className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-2 flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-lg text-orange-600">#{index + 1}</span>
                                                            <span className="text-sm font-medium text-slate-800">{performer.memberName}</span>
                                                        </div>
                                                        <span className="text-sm font-bold text-orange-600">{performer.tablesCompleted} trackerů</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
