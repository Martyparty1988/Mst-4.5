import React, { useState } from 'react';
import { UserProfile, UserRole } from '../types';
import { db } from '../db';
import { Shield, User, Sun } from 'lucide-react';

interface LoginProps {
    onLogin: (user: UserProfile) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [loading, setLoading] = useState(false);
    
    // In a real app, this would use Google OAuth API
    // For this prototype, we simulate the Google Auth response
    const handleGoogleLogin = async (role: UserRole) => {
        setLoading(true);
        
        // Simulating network delay
        setTimeout(async () => {
            const mockUser: UserProfile = {
                id: role === 'admin' ? 'admin_001' : 'emp_001',
                email: role === 'admin' ? 'admin@solar.cz' : 'pepa@solar.cz',
                name: role === 'admin' ? 'Admin Martin' : 'Pepa Montér',
                role: role,
                photoUrl: role === 'admin' ? 'https://ui-avatars.com/api/?name=Admin&background=random' : 'https://ui-avatars.com/api/?name=Pepa&background=random'
            };

            // Ensure the user exists in our local team DB if they are an employee
            if (role === 'employee') {
                const existing = await db.team.where('email').equals(mockUser.email).first();
                if (!existing) {
                    await db.team.add({
                        id: mockUser.id,
                        name: mockUser.name,
                        email: mockUser.email,
                        role: 'Installer',
                        hourlyRate: 250,
                        isActive: true
                    });
                }
            }

            // Save to Users table
            await db.users.put(mockUser);
            
            setLoading(false);
            onLogin(mockUser);
        }, 1000);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="glass-panel w-full max-w-md p-8 flex flex-col items-center text-center animate-fade-in">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-yellow-300 to-orange-500 flex items-center justify-center shadow-2xl mb-6 animate-pulse">
                    <Sun size={40} className="text-white" />
                </div>
                
                <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-md">MST</h1>
                <p className="text-white/80 mb-8">Martyho Solar Tracker</p>

                <div className="w-full space-y-4">
                    <p className="text-xs text-slate-200 font-bold uppercase tracking-wider mb-2">Vyberte přihlášení (Demo)</p>
                    
                    <button 
                        onClick={() => handleGoogleLogin('admin')}
                        disabled={loading}
                        className="glass-button w-full py-4 flex items-center justify-center gap-3 bg-white/20 hover:bg-white/40 transition-all group"
                    >
                        <Shield className="text-indigo-600 group-hover:text-indigo-800" size={24} />
                        <div className="text-left">
                            <div className="text-sm font-bold text-slate-800">Přihlásit jako Admin</div>
                            <div className="text-[10px] text-slate-600">Plný přístup, zálohy, data</div>
                        </div>
                    </button>

                    <button 
                        onClick={() => handleGoogleLogin('employee')}
                        disabled={loading}
                        className="glass-button w-full py-4 flex items-center justify-center gap-3 bg-white/20 hover:bg-white/40 transition-all group"
                    >
                        <User className="text-green-600 group-hover:text-green-800" size={24} />
                        <div className="text-left">
                            <div className="text-sm font-bold text-slate-800">Přihlásit jako Zaměstnanec</div>
                            <div className="text-[10px] text-slate-600">Můj výkon, úkoly, docházka</div>
                        </div>
                    </button>
                </div>

                <div className="mt-8 pt-6 border-t border-white/20 w-full">
                    <div className="flex items-center justify-center gap-2 text-white/60">
                        <span className="text-xs">Powered by Google Sign-In</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;