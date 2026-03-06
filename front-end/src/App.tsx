import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import BusinessesList from '../pages/BusinessesList';
import AddBusiness from '../pages/AddBusiness';
import BusinessPage from '../pages/BusinessPage';
import UserProfile from '../pages/UserProfile';
import Layout from './Layout';
import NotFoundPage from '../pages/NotFoundPage';
import LoginPage from '../pages/LoginPage';
import CreateAccountPage from '../pages/CreateAccountPage';
import AdminReview from '../pages/AdminReview';
import EditBusiness from '../pages/EditBusiness';

const routes = [{
  path: '/',
  element: <Layout />,
  errorElement: <NotFoundPage />,
  children: [{
    path: '/',
    element: <HomePage />,
  },{
    path: '/businesses',
    element: <BusinessesList />,
  },{
    path: '/add-business',
    element: <AddBusiness />
  },{
    path: '/locations/:id',
    element: <BusinessPage /> 
  },{
    path: '/profile',
    element: <UserProfile />
  },{
    path: '/login',
    element: <LoginPage />
  },{
    path: '/create-account',
    element: <CreateAccountPage />
  },{
    path: '/admin/review',
    element: <AdminReview />
  },{
    path: '/businesses/:id/edit',
    element: <EditBusiness />
  }]
}]

const router = createBrowserRouter(routes);

function App() {
  return <RouterProvider router={router} />
}

export default App