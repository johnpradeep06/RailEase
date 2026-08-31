import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { BookingProvider } from "./booking/BookingContext";
import { Spinner } from "./components/ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Results from "./pages/Results";
import SeatSelect from "./pages/SeatSelect";
import Passengers from "./pages/Passengers";
import Payment from "./pages/Payment";
import Confirmation from "./pages/Confirmation";
import MyTrips from "./pages/MyTrips";
import TripDetail from "./pages/TripDetail";
import Feedback from "./pages/Feedback";
import Account from "./pages/Account";
import Admin from "./pages/admin/Admin";
import AdminTrains from "./pages/admin/AdminTrains";
import AdminStations from "./pages/admin/AdminStations";
import AdminRoutes from "./pages/admin/AdminRoutes";
import AdminSchedules from "./pages/admin/AdminSchedules";
import AdminCoaches from "./pages/admin/AdminCoaches";
import AdminOps from "./pages/admin/AdminOps";

function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user)
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BookingProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <Gate>
                <Layout />
              </Gate>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/book" element={<Search />} />
            <Route path="/results" element={<Results />} />
            <Route path="/seats" element={<SeatSelect />} />
            <Route path="/passengers" element={<Passengers />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/confirmation/:bookingId" element={<Confirmation />} />
            <Route path="/trips" element={<MyTrips />} />
            <Route path="/trips/:id" element={<TripDetail />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/account" element={<Account />} />
            <Route path="/admin" element={<Admin />}>
              <Route path="trains" element={<AdminTrains />} />
              <Route path="stations" element={<AdminStations />} />
              <Route path="routes" element={<AdminRoutes />} />
              <Route path="schedules" element={<AdminSchedules />} />
              <Route path="coaches" element={<AdminCoaches />} />
              <Route path="ops" element={<AdminOps />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BookingProvider>
    </AuthProvider>
  );
}
