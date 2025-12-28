import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { UserProfile, Tool, ToolStatus } from '../types';
import {
    Wrench, Plus, Search, Filter, Trash2,
    CheckCircle, AlertTriangle, Clock, MapPin,
    ArrowRight, User as UserIcon, QrCode, X, Check
} from 'lucide-react';

const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

interface Props {
    user: UserProfile;
}

const ToolManagement: React.FC<Props> = ({ user }) => {
    const [view, setView] = useState<'list' | 'create'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<ToolStatus | 'All'>('All');

    // Form State
    const [form, setForm] = useState({ name: '', type: '', barcode: '' });

    // Assign Modal
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assigneeId, setAssigneeId] = useState('');

    const isAdmin = user.role === 'admin';
    const tools = useLiveQuery(() => db.tools.toArray());
    const team = useLiveQuery(() => db.team.toArray());

    const filteredTools = tools?.filter(t => {
        const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.type.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'All' || t.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const handleCreateTool = async () => {
        if (!form.name || !form.type) return;

        await db.tools.add({
            id: generateId(),
            name: form.name,
            type: form.type,
            barcode: form.barcode,
            status: ToolStatus.Available,
            purchaseDate: Date.now()
        });
        setForm({ name: '', type: '', barcode: '' });
        setView('list');
    };

    const handleDeleteTool = async (id: string) => {
        if (window.confirm('Opravdu smazat toto nářadí?')) {
            await db.tools.delete(id);
        }
    };

    const handleStatusChange = async (tool: Tool, status: ToolStatus) => {
        await db.tools.update(tool.id, {
            status,
            borrowedBy: status === ToolStatus.Available ? undefined : tool.borrowedBy,
            borrowedAt: status === ToolStatus.Available ? undefined : tool.borrowedAt
        });
    };

    const openAssignModal = (tool: Tool) => {
        setSelectedTool(tool);
        setAssigneeId('');
        setShowAssignModal(true);
    }

    const handleAssign = async () => {
        if (!selectedTool || !assigneeId) return;

        await db.tools.update(selectedTool.id, {
            status: ToolStatus.Borrowed,
            borrowedBy: assigneeId,
            borrowedAt: Date.now()
        });
        setShowAssignModal(false);
        setSelectedTool(null);
    }

    const handleReturn = async (tool: Tool) => {
        await db.tools.update(tool.id, {
            status: ToolStatus.Available,
            borrowedBy: undefined,
            borrowedAt: undefined
        });
    }

    return (
        <div className="space-y-4 animate-fade-in pb-20">
            {/* Header / Filter Bar */}
            <div className="glass-panel p-3 sticky top-20 z-30 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Wrench size={20} className="text-orange-500" /> Nářadí
                    </h2>
                    {isAdmin && (
                        <button
                            onClick={() => view === 'list' ? setView('create') : setView('list')}
                            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-xl transition-colors shadow-lg">
                            {view === 'list' ? <Plus size={20} /> : <X size={20} />}
                        </button>
                    )}
                </div>

                {view === 'list' && (
                    <div className="flex gap-2">
                        <div className="flex-1 bg-white/40 rounded-xl px-3 py-2 flex items-center gap-2 border border-white/30">
                            <Search size={16} className="text-slate-500" />
                            <input
                                className="bg-transparent border-none outline-none w-full text-sm font-bold text-slate-700 placeholder-slate-400"
                                placeholder="Hledat..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as any)}
                            className="bg-white/40 border border-white/30 rounded-xl px-2 text-xs font-bold text-slate-600 outline-none"
                        >
                            <option value="All">Vše</option>
                            <option value="Available">Volné</option>
                            <option value="Borrowed">Půjčené</option>
                            <option value="Broken">Rozbité</option>
                        </select>
                    </div>
                )}
            </div>

            {/* CREATE VIEW */}
            {view === 'create' && (
                <div className="glass-panel p-6 animate-fade-in">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Nové nářadí</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 ml-1">Název</label>
                            <input className="glass-input w-full mt-1" placeholder="Makita DDF485..." value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 ml-1">Typ / Kategorie</label>
                            <input className="glass-input w-full mt-1" placeholder="Vrtačka, Bruska..." value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 ml-1">Čárový kód / Sériové číslo</label>
                            <div className="relative">
                                <QrCode className="absolute left-3 top-3 text-slate-400" size={16} />
                                <input className="glass-input w-full mt-1 pl-10" placeholder="S/N..." value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} />
                            </div>
                        </div>
                        <button onClick={handleCreateTool} className="glass-button-primary w-full py-3 mt-2 flex justify-center gap-2">
                            <Plus size={18} /> Přidat do evidence
                        </button>
                    </div>
                </div>
            )}

            {/* LIST VIEW */}
            {view === 'list' && (
                <div className="grid gap-3">
                    {filteredTools?.map(tool => {
                        const borrower = team?.find(m => m.id === tool.borrowedBy);
                        const isAvailable = tool.status === ToolStatus.Available;
                        const isBorrowed = tool.status === ToolStatus.Borrowed;
                        const isBroken = tool.status === ToolStatus.Broken;

                        return (
                            <div key={tool.id} className="glass-panel p-4 flex flex-col gap-3 group">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm ${isAvailable ? 'bg-green-100 text-green-600 border-green-200' :
                                                isBorrowed ? 'bg-blue-100 text-blue-600 border-blue-200' :
                                                    'bg-red-100 text-red-600 border-red-200'
                                            }`}>
                                            <Wrench size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-sm">{tool.name}</h3>
                                            <p className="text-xs text-slate-500 font-medium">{tool.type}</p>
                                        </div>
                                    </div>
                                    <div className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${isAvailable ? 'bg-green-50 text-green-700 border-green-100' :
                                            isBorrowed ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                'bg-red-50 text-red-700 border-red-100'
                                        }`}>
                                        {isAvailable ? 'Skladem' : isBorrowed ? 'Půjčeno' : 'Servis'}
                                    </div>
                                </div>

                                {isBorrowed && borrower && (
                                    <div className="bg-blue-50/50 border border-blue-100 p-2 rounded-lg flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center text-[10px] font-bold text-blue-800">
                                                {borrower.name.charAt(0)}
                                            </div>
                                            <span className="text-xs font-bold text-slate-700">{borrower.name}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <Clock size={10} />
                                            {tool.borrowedAt ? new Date(tool.borrowedAt).toLocaleDateString() : ''}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2 mt-1">
                                    {isAvailable && (
                                        <button
                                            onClick={() => openAssignModal(tool)}
                                            className="flex-1 bg-white/50 hover:bg-white text-slate-700 py-2 rounded-lg text-xs font-bold border border-white/60 transition-colors flex items-center justify-center gap-2">
                                            <ArrowRight size={14} className="text-blue-500" /> Půjčit
                                        </button>
                                    )}
                                    {isBorrowed && (
                                        <button
                                            onClick={() => handleReturn(tool)}
                                            className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg text-xs font-bold shadow-md transition-colors flex items-center justify-center gap-2">
                                            <CheckCircle size={14} /> Vrátit
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <>
                                            <button
                                                onClick={() => handleStatusChange(tool, isBroken ? ToolStatus.Available : ToolStatus.Broken)}
                                                className={`w-10 flex items-center justify-center rounded-lg border transition-colors ${isBroken ? 'bg-green-100 text-green-600 border-green-200' : 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'}`}>
                                                {isBroken ? <Check size={16} /> : <AlertTriangle size={16} />}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTool(tool.id)}
                                                className="w-10 flex items-center justify-center rounded-lg bg-slate-100 text-slate-400 hover:text-red-500 transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                    {(!filteredTools || filteredTools.length === 0) && (
                        <div className="glass-panel p-8 text-center text-slate-500">
                            <p>Žádné nářadí.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ASSIGN MODAL */}
            {showAssignModal && selectedTool && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
                    <div className="glass-panel w-full max-w-sm p-5 bg-white/90 shadow-2xl relative">
                        <button onClick={() => setShowAssignModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        <h3 className="text-base font-bold text-slate-800 mb-1">Půjčit nářadí</h3>
                        <p className="text-sm text-slate-500 mb-4">{selectedTool.name}</p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 ml-1">Vyberte pracovníka</label>
                                <div className="max-h-60 overflow-y-auto mt-2 space-y-1">
                                    {team?.map(member => (
                                        <button
                                            key={member.id}
                                            onClick={() => setAssigneeId(member.id)}
                                            className={`w-full p-2 rounded-lg flex items-center gap-3 border transition-all ${assigneeId === member.id ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                                {member.name.charAt(0)}
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">{member.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                disabled={!assigneeId}
                                onClick={handleAssign}
                                className="glass-button-primary w-full py-3 disabled:opacity-50 flex justify-center items-center gap-2">
                                <Check size={18} /> Potvrdit předání
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ToolManagement;
