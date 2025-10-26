import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  collection,
  getDocs,
  orderBy,
  query as fsQuery,
  doc as fsDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../../../config/firebase'
import { Input } from '../../../components/ui/input'
import { Button } from '../../../components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../../../components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/table'
// Select is available but we use native selects for simplicity here

export const Route = createFileRoute('/dashboard/admin/users')({
  component: RouteComponent,
})

type UserDoc = {
  userId: string
  email: string
  name?: string
  surname?: string
  phoneNumber?: string
  dob?: string
  gender?: string
  isActive?: boolean
  isAdmin?: boolean
  createdAt?: any
  updatedAt?: any
  [key: string]: any
}

function RouteComponent() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'disabled'>('all')
  const [filterAdmin, setFilterAdmin] = useState<'all' | 'admin' | 'user'>('all')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [editValues, setEditValues] = useState<Partial<UserDoc>>({})
  const [modalUser, setModalUser] = useState<UserDoc | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Fetch all users once and paginate/filter client-side. For large datasets switch to server-side cursors.
  const { data: users = [], isPending, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const col = collection(db, 'users')
      const q = fsQuery(col, orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }))
    }
  })

  const filtered = useMemo(() => {
  let list = users as any[]
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter((u) => {
        return (
          (u.name || '').toLowerCase().includes(s) ||
          (u.surname || '').toLowerCase().includes(s) ||
          (u.email || '').toLowerCase().includes(s) ||
          (u.phoneNumber || '').toLowerCase().includes(s)
        )
      })
    }
    if (filterActive !== 'all') {
      list = list.filter((u) => !!u.isActive === (filterActive === 'active'))
    }
    if (filterAdmin !== 'all') {
      list = list.filter((u) => !!u.isAdmin === (filterAdmin === 'admin'))
    }
    // sort by createdAt desc defensively
    list = list.sort((a, b) => {
      const ta = a.createdAt && (a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) || 0
      const tb = b.createdAt && (b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) || 0
      return tb - ta
    })
    return list
  }, [users, search, filterActive, filterAdmin])

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize)

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<UserDoc> }) => {
      const docRef = fsDoc(db, 'users', id)
      // sanitize payload: email is readonly
      const allowed: Record<string, any> = {}
      const fields = ['name', 'surname', 'phoneNumber', 'dob', 'gender', 'isActive', 'isAdmin']
      for (const k of fields) {
        if (k in payload) allowed[k] = (payload as any)[k]
      }
      allowed.updatedAt = new Date()
      await updateDoc(docRef, allowed)
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    }
  })

  function formatDobForInput(val: any) {
    if (!val) return ''
    try {
      const d = typeof val === 'string' ? new Date(val) : val?.seconds ? new Date(val.seconds * 1000) : val?.toDate ? val.toDate() : new Date(val)
      if (isNaN(d.getTime())) return ''
      // yyyy-mm-dd for input[type=date]
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    } catch {
      return ''
    }
  }

  function formatDobDisplay(val: any) {
    if (!val) return ''
    try {
      const d = typeof val === 'string' ? new Date(val) : val?.seconds ? new Date(val.seconds * 1000) : val?.toDate ? val.toDate() : new Date(val)
      if (isNaN(d.getTime())) return String(val)
      return d.toLocaleDateString()
    } catch {
      return String(val)
    }
  }

  

  function openModal(u: any) {
    setModalUser(u as UserDoc)
    setModalOpen(true)
    setEditValues({
      name: u.name || '',
      surname: u.surname || '',
      phoneNumber: u.phoneNumber || '',
      dob: formatDobForInput(u.dob) || '',
      gender: u.gender || '',
      isActive: !!u.isActive,
      isAdmin: !!u.isAdmin,
    })
  }

  function closeModal() {
    setModalOpen(false)
    setModalUser(null)
    setEditValues({})
  }

  async function saveModal() {
    if (!modalUser) return
    await updateMutation.mutateAsync({ id: (modalUser as any).id, payload: editValues } as any)
    closeModal()
  }

  return (
    <div className="p-4">
<h1 className='py-4 font-bold'>Users Management</h1>
      <div className="flex items-center gap-3 mb-4">
  <Input placeholder="Search by name, email or phone" value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value); setPage(1) }} className="max-w-md" />
        <div className="w-40">
          <Select value={filterActive} onValueChange={(v) => { setFilterActive(v as any); setPage(1) }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={filterAdmin} onValueChange={(v) => { setFilterAdmin(v as any); setPage(1) }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} className="ml-auto border rounded-md px-2 py-1">
          <option value={5}>5 / page</option>
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
        </select>
      </div>

      {/* Modal portal for view/edit */}
      {modalOpen && modalUser && ReactDOM.createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
          <div className="fixed inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-lg shadow-lg w-full max-w-2xl mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">User details</h3>
              <button onClick={closeModal} className="text-gray-500">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">First name</label>
                <Input value={String(editValues.name || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValues((s) => ({ ...s, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Surname</label>
                <Input value={String(editValues.surname || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValues((s) => ({ ...s, surname: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Email (readonly)</label>
                <input value={modalUser.email} readOnly className="w-full rounded-md border px-3 py-2 bg-gray-50 text-sm" />
              </div>
              <div>
                <label className="text-sm text-gray-600">Phone</label>
                <Input value={String(editValues.phoneNumber || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValues((s) => ({ ...s, phoneNumber: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-gray-600">DOB</label>
                <input type="date" value={String(editValues.dob || '')} onChange={(e) => setEditValues((s) => ({ ...s, dob: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm text-gray-600">Gender</label>
                <Select value={editValues.gender ? String(editValues.gender) : 'none'} onValueChange={(v) => setEditValues((s) => ({ ...s, gender: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Active</label>
                <Select value={editValues.isActive ? 'yes' : 'no'} onValueChange={(v) => setEditValues((s) => ({ ...s, isActive: v === 'yes' }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Admin</label>
                <Select value={editValues.isAdmin ? 'yes' : 'no'} onValueChange={(v) => setEditValues((s) => ({ ...s, isAdmin: v === 'yes' }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button onClick={saveModal} disabled={(updateMutation as any).isLoading}>Save changes</Button>
            </div>
          </div>
        </div>, document.body
      )}

      <div className="bg-white rounded-md shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={9}>Loading...</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={9}>Error loading users</TableCell>
              </TableRow>
            ) : pageData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>No users found</TableCell>
              </TableRow>
            ) : (
              pageData.map((u: any) => (
                <TableRow key={u.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openModal(u)}>
                  <TableCell className="py-3">{`${u.name || ''} ${u.surname || ''}`}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-700">{u.email}</TableCell>
                  <TableCell className="py-3">{u.phoneNumber || ''}</TableCell>
                  <TableCell className="py-3">{formatDobDisplay(u.dob)}</TableCell>
                  <TableCell className="py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.gender === 'male' ? 'bg-blue-100 text-blue-800' : u.gender === 'female' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-800'}`}>
                      {u.gender || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {u.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.isAdmin ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}>
                      {u.isAdmin ? 'Admin' : 'User'}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 text-xs text-gray-500">{u.createdAt ? (u.createdAt.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleString() : new Date(u.createdAt).toLocaleString()) : ''}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3">
        <div className="text-sm text-gray-600">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <div className="text-sm">Page {page} / {totalPages}</div>
          <Button size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
        </div>
      </div>
    </div>
  )
}
