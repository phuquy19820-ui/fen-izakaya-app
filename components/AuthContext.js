import { createContext, useContext } from 'react';

export const AuthContext = createContext({ user: null, refresh: async () => null });
export const useAuth = () => useContext(AuthContext);
