ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
ON public.products
FOR SELECT
TO public
USING (true);