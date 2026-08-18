import { RouterProvider } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { SessionBootstrap } from "@/components/common/SessionBootstrap";
import { router } from "@/router";

export function App() {
  return (
    <>
      <SessionBootstrap />
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        toastOptions={{
          className:
            "rounded-lg border border-border bg-white text-sm text-secondary shadow-lg",
          duration: 3500,
        }}
      />
    </>
  );
}

export default App;
