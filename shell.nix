{ pkgs ? import <nixpkgs> {}, ... }:

let
  python = pkgs.python314.withPackages (ps: with ps; [
    fastapi
    uvicorn
    pydantic-settings
    httpx
    numpy
    rasterio
  ]);
in
pkgs.mkShell
{
  packages = with pkgs; [nodejs_24 python];
}
