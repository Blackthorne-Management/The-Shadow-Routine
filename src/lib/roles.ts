// Staff = profiles.role 'admin'. Staff with is_super_admin are Admins (full
// access, incl. reading direct messages); staff without it are Mentors.
// What everyone sees: an Admin who also mentors a cohort shows as "Mentor";
// only an Admin who mentors no cohort shows as "Admin".
interface RoleFields { role: string; is_super_admin?: boolean | null; is_mentor?: boolean | null }

export const isStaff = (p: RoleFields | null | undefined) => p?.role === 'admin';
export const isSuperAdmin = (p: RoleFields | null | undefined) => p?.role === 'admin' && !!p.is_super_admin;
export const staffLabel = (p: RoleFields | null | undefined) => (isSuperAdmin(p) && !p?.is_mentor ? 'Admin' : 'Mentor');
