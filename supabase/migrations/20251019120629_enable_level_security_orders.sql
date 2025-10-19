ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable users to view their own data only"
ON public.orders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);