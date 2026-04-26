interface ZipCloudResult {
  address1: string;
  address2: string;
  address3: string;
}

interface ZipCloudResponse {
  status: number;
  message: string | null;
  results: ZipCloudResult[] | null;
}

export async function lookupJapaneseAddress(zipcode: string) {
  const normalizedZipcode = zipcode.replace(/[^\d]/g, "");
  if (normalizedZipcode.length !== 7) {
    return null;
  }

  const callbackName = `zipcloudCallback_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const script = document.createElement("script");

  return new Promise<string | null>((resolve, reject) => {
    const cleanup = () => {
      script.remove();
      delete window[callbackName as keyof Window];
    };

    window[callbackName as keyof Window] = ((response: ZipCloudResponse) => {
      cleanup();
      const [result] = response.results ?? [];
      if (response.status !== 200 || !result) {
        resolve(null);
        return;
      }

      resolve(`${result.address1}${result.address2}${result.address3}`);
    }) as never;

    script.onerror = () => {
      cleanup();
      reject(new Error("Zipcode lookup failed"));
    };
    script.src = `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${encodeURIComponent(
      normalizedZipcode,
    )}&callback=${encodeURIComponent(callbackName)}`;
    document.body.appendChild(script);
  });
}
