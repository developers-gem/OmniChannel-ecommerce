'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users, Shield, Plus, Mail } from 'lucide-react';
import { UserRole } from '@multichannel/shared';

export default function TeamsPage() {
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const res: any = await api.get('/teams');
      return res.data;
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ memberId, role }: any) => {
      const res: any = await api.put(`/teams/${memberId}/role`, { role });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Team & Permissions</h1>
          <p className="text-xs text-slate-400 mt-1">
            Role-based access control (RBAC) across your organization
          </p>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
            Active Organization Members
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Member Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4 text-center">Assigned Role</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Loading team members...
                  </td>
                </tr>
              ) : members && members.length > 0 ? (
                members.map((m: any) => (
                  <tr key={m._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {m.userId?.firstName} {m.userId?.lastName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">{m.userId?.email}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="bg-brand-950 text-brand-400 border border-brand-800/60 px-2.5 py-0.5 rounded text-[10px] font-bold">
                        {m.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                        {m.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <select
                        value={m.role}
                        disabled={m.role === 'OWNER'}
                        onChange={(e) =>
                          roleMutation.mutate({ memberId: m._id, role: e.target.value })
                        }
                        className="bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2 py-1 rounded-lg outline-none disabled:opacity-40"
                      >
                        <option value={UserRole.ADMIN}>ADMIN</option>
                        <option value={UserRole.MANAGER}>MANAGER</option>
                        <option value={UserRole.MEMBER}>MEMBER</option>
                        <option value={UserRole.VIEWER}>VIEWER</option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
